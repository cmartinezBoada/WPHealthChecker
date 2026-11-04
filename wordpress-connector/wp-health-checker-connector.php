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

function whcc_get_site_health() {
	// Saved by WP Admin > Tools > Site Health, e.g. '{"good":15,"recommended":4,"critical":1}'.
	$transient = get_transient( 'health-check-site-status-result' );

	if ( ! is_string( $transient ) ) {
		return rest_ensure_response( null );
	}

	$data = json_decode( $transient, true );

	if ( ! is_array( $data ) || ! isset( $data['good'], $data['recommended'], $data['critical'] ) ) {
		return rest_ensure_response( null );
	}

	return rest_ensure_response(
		array(
			'good'        => (int) $data['good'],
			'recommended' => (int) $data['recommended'],
			'critical'    => (int) $data['critical'],
		)
	);
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
