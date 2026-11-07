<?php
/**
 * Plugin Name: WP Health Checker Connector
 * Description: Exposes available plugin updates to the WP Health Checker app via the REST API.
 * Version: 1.0.0
 * Requires at least: 5.5
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', 'whcc_register_routes' );

function whcc_register_routes() {
	register_rest_route(
		'health-checker/v1',
		'/updates',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'whcc_get_updates',
			'permission_callback' => 'whcc_can_view_updates',
		)
	);

	register_rest_route(
		'health-checker/v1',
		'/version',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'whcc_get_version',
			'permission_callback' => 'whcc_can_view_version',
		)
	);

	register_rest_route(
		'health-checker/v1',
		'/site-health',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'whcc_get_site_health',
			'permission_callback' => 'whcc_can_view_site_health',
		)
	);

	register_rest_route(
		'health-checker/v1',
		'/performance',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'whcc_get_performance',
			'permission_callback' => 'whcc_can_view_performance',
		)
	);

	register_rest_route(
		'health-checker/v1',
		'/update-plugin',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'whcc_update_plugin',
			'permission_callback' => 'whcc_can_update_plugins',
			'args'                => array(
				'plugin' => array(
					'description'       => 'Plugin identifier, same format as /wp/v2/plugins (e.g. "akismet/akismet").',
					'type'              => 'string',
					'required'          => true,
					// Same pattern as /wp/v2/plugins/<plugin>: no dots, so no ".." nor ".php".
					'pattern'           => '^[^.\/]+(?:\/[^.\/]+)?$',
					'validate_callback' => 'rest_validate_request_arg',
				),
			),
		)
	);
}

function whcc_can_update_plugins() {
	return current_user_can( 'update_plugins' );
}

// Updates one plugin like the Plugins screen does, but without any interactive output.
function whcc_update_plugin( WP_REST_Request $request ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

	$plugin = $request['plugin'];
	$file   = $plugin . '.php';

	$installed = get_plugins();
	if ( ! isset( $installed[ $file ] ) ) {
		return new WP_Error(
			'whcc_plugin_not_installed',
			sprintf( 'The plugin "%s" is not installed.', $plugin ),
			array( 'status' => 404 )
		);
	}

	$transient = get_site_transient( 'update_plugins' );
	if ( ! whcc_plugin_updates_are_known( $transient ) ) {
		whcc_refresh_plugin_updates();
		$transient = get_site_transient( 'update_plugins' );
	}
	if ( ! whcc_plugin_updates_are_known( $transient ) ) {
		return new WP_Error(
			'whcc_updates_unknown',
			'Plugin updates could not be checked: WordPress.org did not answer.',
			array( 'status' => 503 )
		);
	}
	if ( empty( $transient->response[ $file ] ) || empty( ( (object) $transient->response[ $file ] )->new_version ) ) {
		return new WP_Error(
			'whcc_no_update_available',
			sprintf( 'No update is available for the plugin "%s".', $plugin ),
			array( 'status' => 409 )
		);
	}

	// Diagnostic: premium plugins (e.g. ACF Pro) only get a package URL with a valid license.
	// Only the host is logged: the full URL may contain a license key.
	$package = (string) ( ( (object) $transient->response[ $file ] )->package ?? '' );
	error_log(
		sprintf(
			'WP Health Checker Connector: updating %s, package %s',
			$plugin,
			'' === $package ? 'EMPTY' : 'present (host: ' . ( wp_parse_url( $package, PHP_URL_HOST ) ?: 'unparsable' ) . ')'
		)
	);

	$previous_version = (string) $installed[ $file ]['Version'];
	$expected_version = (string) ( (object) $transient->response[ $file ] )->new_version;
	$network_wide     = is_multisite() && is_plugin_active_for_network( $file );
	$was_active       = $network_wide || is_plugin_active( $file );

	$skin     = new WP_Ajax_Upgrader_Skin();
	$upgrader = new Plugin_Upgrader( $skin );

	// The skin collects messages instead of printing them; this catches any stray output
	// that would corrupt the JSON response.
	ob_start();
	$result = $upgrader->upgrade( $file );
	ob_end_clean();

	// Outside WP-Cron, Plugin_Upgrader silently deactivates the plugin before installing and
	// never reactivates it. Reactivate it even if the update failed: WordPress restores the
	// previous version from its temporary backup in that case.
	$reactivation_error = whcc_reactivate_plugin( $file, $was_active, $network_wide );

	$errors = whcc_upgrader_errors( $result, $skin );

	// The upgrader's verdict is not enough: check what is really on disk now. Clear only the
	// get_plugins() cache here (not the update transient, which is rebuilt below).
	wp_clean_plugins_cache( false );
	$installed_now     = get_plugins();
	$installed_version = isset( $installed_now[ $file ] ) ? (string) $installed_now[ $file ]['Version'] : null;

	if ( ! $errors && $installed_version !== $expected_version ) {
		$errors[] = sprintf(
			'The update did not install the expected version: expected %s, found %s.',
			$expected_version,
			null === $installed_version ? 'no plugin file' : $installed_version
		);
	}

	if ( $errors ) {
		if ( $reactivation_error ) {
			$errors[] = $reactivation_error;
		}
		return whcc_update_error( $errors, $skin );
	}

	if ( $reactivation_error ) {
		return whcc_update_error( array( $reactivation_error ), $skin );
	}

	// The upgrader deleted the update_plugins transient: rebuild it now so that /updates
	// still lists the other plugins' updates.
	whcc_refresh_plugin_updates();

	return rest_ensure_response(
		array(
			'plugin'           => $plugin,
			'previous_version' => $previous_version,
			'new_version'      => $installed_version,
		)
	);
}

// Failure response, with everything the upgrader skin collected (URLs reduced to their host).
function whcc_update_error( array $errors, WP_Ajax_Upgrader_Skin $skin ) {
	$errors = array_map( 'whcc_redact_urls', $errors );

	return new WP_Error(
		'whcc_update_failed',
		implode( ' ', $errors ),
		array(
			'status'   => 500,
			'errors'   => $errors,
			'messages' => array_map( 'whcc_redact_urls', $skin->get_upgrade_messages() ),
		)
	);
}

// Same checks as wp_ajax_update_plugin(), plus: false, null or a WP_Error from the upgrader is
// always a failure. Returns the error messages, empty only when the upgrader returned true.
function whcc_upgrader_errors( $result, WP_Ajax_Upgrader_Skin $skin ) {
	if ( is_wp_error( $skin->result ) ) {
		return $skin->result->get_error_messages();
	}

	if ( $skin->get_errors()->has_errors() ) {
		return $skin->get_errors()->get_error_messages();
	}

	if ( is_wp_error( $result ) ) {
		return $result->get_error_messages();
	}

	if ( false === $result ) {
		global $wp_filesystem;

		if ( $wp_filesystem instanceof WP_Filesystem_Base && is_wp_error( $wp_filesystem->errors ) && $wp_filesystem->errors->has_errors() ) {
			return $wp_filesystem->errors->get_error_messages();
		}
		return array( 'The upgrader failed without giving a reason.' );
	}

	if ( null === $result ) {
		return array( 'The upgrader returned no result.' );
	}

	return array();
}

// Upgrader messages contain the package URL ("Downloading update from <url>…"), which may hold
// a license key: keep only the scheme and host, and drop the HTML markup.
function whcc_redact_urls( $text ) {
	$text = wp_strip_all_tags( (string) $text );

	return preg_replace_callback(
		'#\bhttps?://[^\s"\'<>]+#i',
		function ( $match ) {
			$parts = wp_parse_url( $match[0] );
			return empty( $parts['host'] ) ? '[URL]' : ( $parts['scheme'] ?? 'https' ) . '://' . $parts['host'] . '/[…]';
		},
		$text
	);
}

// Returns an error message, or null when there was nothing to do or reactivation worked.
function whcc_reactivate_plugin( $file, $was_active, $network_wide ) {
	if ( ! $was_active ) {
		return null;
	}

	$active_now = $network_wide ? is_plugin_active_for_network( $file ) : is_plugin_active( $file );
	if ( $active_now ) {
		return null;
	}

	try {
		// Silent, like the "activate-plugin" step of wp-admin/update.php: no activation hooks.
		$activated = activate_plugin( $file, '', $network_wide, true );
	} catch ( Throwable $e ) {
		$activated = new WP_Error( 'whcc_reactivation_failed', $e->getMessage() );
	}

	if ( is_wp_error( $activated ) ) {
		return sprintf( 'The plugin was deactivated during the update and could not be reactivated: %s', $activated->get_error_message() );
	}

	return null;
}

function whcc_can_view_performance() {
	return current_user_can( 'manage_options' );
}

define( 'WHCC_PERFORMANCE_OPTION', 'whcc_performance' );
define( 'WHCC_PERFORMANCE_CRON_HOOK', 'whcc_measure_performance' );
define( 'WHCC_PERFORMANCE_SAMPLES', 3 );

// The measurement runs in WP-Cron, never during a REST request: with few PHP workers
// (2 on Local), loopback requests made while the dashboard loads wait for a free worker
// and time out.
add_action( WHCC_PERFORMANCE_CRON_HOOK, 'whcc_run_performance_measurement' );

register_activation_hook( __FILE__, 'whcc_schedule_performance_measurement' );
register_deactivation_hook( __FILE__, 'whcc_unschedule_performance_measurement' );

// The plugin may already be active (activation hook never ran), so reschedule if missing.
add_action( 'init', 'whcc_schedule_performance_measurement' );

function whcc_schedule_performance_measurement() {
	if ( ! wp_next_scheduled( WHCC_PERFORMANCE_CRON_HOOK ) ) {
		// First run on the next cron spawn, then hourly.
		wp_schedule_event( time(), 'hourly', WHCC_PERFORMANCE_CRON_HOOK );
	}
}

function whcc_unschedule_performance_measurement() {
	wp_clear_scheduled_hook( WHCC_PERFORMANCE_CRON_HOOK );
}

// On failure, the previous result is kept and the error is logged.
function whcc_run_performance_measurement() {
	$result = whcc_measure_performance();

	if ( is_wp_error( $result ) ) {
		error_log( 'WP Health Checker Connector: ' . $result->get_error_message() );
		return;
	}

	update_option( WHCC_PERFORMANCE_OPTION, $result, false );
}

// Only reads the stored result: null until the first measurement has run.
// The REST server sends no body for null data, so make it an explicit 204 No Content.
function whcc_get_performance() {
	$stored = get_option( WHCC_PERFORMANCE_OPTION, null );

	if ( ! is_array( $stored ) ) {
		return new WP_REST_Response( null, 204 );
	}

	return rest_ensure_response( $stored );
}

// Median server response time of the home page, measured with loopback requests.
function whcc_measure_performance() {
	$url  = home_url( '/' );
	$args = array(
		'timeout'   => 10,
		// Same filter as core loopback requests (WP_Site_Health::can_perform_loopback()),
		// so self-signed local certificates are accepted.
		'sslverify' => apply_filters( 'https_local_ssl_verify', false ),
	);

	$durations = array();

	for ( $i = 0; $i < WHCC_PERFORMANCE_SAMPLES; $i++ ) {
		$start    = microtime( true );
		$response = wp_remote_get( $url, $args );
		$elapsed  = ( microtime( true ) - $start ) * 1000;

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'whcc_performance_request_failed',
				sprintf( 'The request to the home page (%s) failed: %s', $url, $response->get_error_message() ),
				array( 'status' => 502 )
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return new WP_Error(
				'whcc_performance_bad_status',
				sprintf( 'The home page (%s) returned HTTP %d instead of 200.', $url, $code ),
				array( 'status' => 502 )
			);
		}

		$durations[] = $elapsed;
	}

	sort( $durations );

	return array(
		'response_time_ms' => (int) round( $durations[ intdiv( count( $durations ), 2 ) ] ),
		'measured_at'      => time(),
	);
}

function whcc_can_view_updates() {
	return current_user_can( 'update_plugins' );
}

function whcc_can_view_version() {
	return current_user_can( 'update_core' );
}

function whcc_get_version() {
	global $wp_version;

	$latest    = null;
	$transient = get_site_transient( 'update_core' );

	if ( is_object( $transient ) && ! empty( $transient->updates ) && is_array( $transient->updates ) ) {
		foreach ( $transient->updates as $offer ) {
			$offer = (object) $offer;

			if ( isset( $offer->response, $offer->version )
				&& 'upgrade' === $offer->response
				&& version_compare( $offer->version, $wp_version, '>' ) ) {
				$latest = (string) $offer->version;
				break;
			}
		}
	}

	return rest_ensure_response(
		array(
			'version' => (string) $wp_version,
			'latest'  => $latest,
		)
	);
}

function whcc_can_view_site_health() {
	return current_user_can( 'manage_options' );
}

// The transient only stores counts, so run the tests like WP_Site_Health::wp_cron_scheduled_check()
// to also know which ones failed.
function whcc_get_site_health() {
	require_once ABSPATH . 'wp-admin/includes/admin.php';

	$site_health = WP_Site_Health::get_instance();
	$tests       = WP_Site_Health::get_tests();

	// Don't run https test on development environments.
	if ( $site_health->is_development_environment() ) {
		unset( $tests['async']['https_status'] );
	}

	$callbacks = array();

	foreach ( $tests['direct'] as $test ) {
		if ( ! empty( $test['skip_cron'] ) ) {
			continue;
		}

		if ( is_string( $test['test'] ) && is_callable( array( $site_health, 'get_test_' . $test['test'] ) ) ) {
			$callbacks[] = array( $site_health, 'get_test_' . $test['test'] );
		} elseif ( is_callable( $test['test'] ) ) {
			$callbacks[] = $test['test'];
		}
	}

	// Async tests without a direct runner would need a loopback HTTP request: skip them.
	foreach ( $tests['async'] as $test ) {
		if ( empty( $test['skip_cron'] ) && ! empty( $test['async_direct_test'] ) && is_callable( $test['async_direct_test'] ) ) {
			$callbacks[] = $test['async_direct_test'];
		}
	}

	$site_status = array(
		'good'        => 0,
		'recommended' => 0,
		'critical'    => 0,
		'issues'      => array(),
	);

	foreach ( $callbacks as $callback ) {
		// Same filter as WP_Site_Health::perform_test(), which is private.
		$result = apply_filters( 'site_status_test_result', call_user_func( $callback ) );

		if ( ! is_array( $result ) || empty( $result['status'] ) ) {
			continue;
		}

		if ( 'critical' === $result['status'] || 'recommended' === $result['status'] ) {
			++$site_status[ $result['status'] ];
			$site_status['issues'][] = array(
				'test'   => isset( $result['test'] ) ? (string) $result['test'] : '',
				'status' => $result['status'],
			);
		} else {
			++$site_status['good'];
		}
	}

	return rest_ensure_response( $site_status );
}

// The transient only reflects a real check once "checked" is filled. wp_update_plugins() first
// stores a placeholder holding just "last_checked", and leaves it as is if WordPress.org can't be
// reached: an empty "response" then means "unknown", not "everything is up to date".
function whcc_plugin_updates_are_known( $transient ) {
	return is_object( $transient ) && ! empty( $transient->checked ) && is_array( $transient->checked );
}

// Rebuilds the update_plugins transient (deleted by WordPress after every plugin update).
function whcc_refresh_plugin_updates() {
	if ( ! function_exists( 'wp_update_plugins' ) ) {
		require_once ABSPATH . WPINC . '/update.php';
	}
	wp_update_plugins();
}

function whcc_get_updates() {
	$transient = get_site_transient( 'update_plugins' );

	if ( ! whcc_plugin_updates_are_known( $transient ) ) {
		whcc_refresh_plugin_updates();
		$transient = get_site_transient( 'update_plugins' );
	}

	if ( ! whcc_plugin_updates_are_known( $transient ) ) {
		return new WP_Error(
			'whcc_updates_unknown',
			'Plugin updates could not be checked: WordPress.org did not answer.',
			array( 'status' => 503 )
		);
	}

	$updates = array();

	if ( empty( $transient->response ) || ! is_array( $transient->response ) ) {
		return rest_ensure_response( $updates );
	}

	foreach ( $transient->response as $plugin_file => $data ) {
		$data = (object) $data;

		if ( empty( $data->new_version ) ) {
			continue;
		}

		$updates[] = array(
			// Match the /wp/v2/plugins format: "wordfence/wordfence.php" -> "wordfence/wordfence".
			'plugin'      => preg_replace( '/\.php$/', '', $plugin_file ),
			'new_version' => (string) $data->new_version,
		);
	}

	return rest_ensure_response( $updates );
}
