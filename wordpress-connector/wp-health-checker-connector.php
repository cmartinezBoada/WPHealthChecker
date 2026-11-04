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
