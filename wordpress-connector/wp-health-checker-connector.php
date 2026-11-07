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

function whcc_get_updates() {
	$transient = get_site_transient( 'update_plugins' );
	$updates   = array();

	if ( ! is_object( $transient ) || empty( $transient->response ) || ! is_array( $transient->response ) ) {
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
