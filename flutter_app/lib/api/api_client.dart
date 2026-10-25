import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/models.dart';

/// Thrown for any non-2xx response. [message] is the server's `error` field
/// when it sent one.
class ApiException implements Exception {
  final int status;
  final String message;

  const ApiException(this.status, this.message);

  @override
  String toString() => message;
}

/// Thin wrapper around package:http for the WasteLess /api/mobile REST API.
///
/// Adds the `Authorization: Bearer <token>` header, decodes JSON and turns
/// error responses into [ApiException]. A 401 calls [onUnauthorized] so the
/// app can sign the user out.
class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
      : _http = httpClient ?? http.Client(),
        baseUrl = baseUrl ?? AppConfig.apiUrl;

  final http.Client _http;

  /// Server base URL, e.g. `https://wasteless-web.onrender.com`. Defaults to
  /// [AppConfig.apiUrl]; a value saved on the login screen overrides it.
  String baseUrl;

  static const _serverKey = 'server_url';

  /// Trims whitespace and trailing slashes, and adds `https://` when no
  /// scheme was given.
  static String normalizeUrl(String url) {
    var u = url.trim().replaceAll(RegExp(r'/+$'), '');
    if (u.isNotEmpty && !u.contains('://')) u = 'https://$u';
    return u;
  }

  /// Loads the server URL saved by [saveBaseUrl], if any.
  Future<void> loadSavedBaseUrl() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getString(_serverKey);
      if (saved != null && saved.isNotEmpty) baseUrl = saved;
    } catch (_) {
      // No storage available; keep the default.
    }
  }

  /// Switches to [url] and remembers it across app restarts. An empty value
  /// resets to the build-time default.
  Future<void> saveBaseUrl(String url) async {
    final u = normalizeUrl(url);
    baseUrl = u.isEmpty ? AppConfig.apiUrl : u;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (u.isEmpty) {
        await prefs.remove(_serverKey);
      } else {
        await prefs.setString(_serverKey, u);
      }
    } catch (_) {
      // Not persisted, but still used for this session.
    }
  }

  String? token;
  void Function()? onUnauthorized;

  static const _timeout = Duration(seconds: 20);

  Uri _uri(String path, [Map<String, String?>? query]) {
    final q = <String, String>{
      for (final e in (query ?? const <String, String?>{}).entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    return Uri.parse('$baseUrl/api/mobile$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(_timeout);
    } on TimeoutException {
      throw const ApiException(0, 'The server took too long to respond.');
    } catch (e) {
      throw ApiException(0, 'Cannot reach the server at $baseUrl. Is it running?');
    }

    Map<String, dynamic> body = const {};
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) body = decoded;
      } on FormatException {
        // Non-JSON body (e.g. an HTML error page); handled below.
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    final message = body['error'] as String? ?? 'Request failed (${res.statusCode}).';
    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    throw ApiException(res.statusCode, message);
  }

  Future<Map<String, dynamic>> get(String path, [Map<String, String?>? query]) =>
      _send(() => _http.get(_uri(path, query), headers: _headers));

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) =>
      _send(() => _http.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  // ---- Typed endpoints -------------------------------------------------

  Future<LoginResponse> login(String email, String password) async =>
      LoginResponse.fromJson(await post('/auth/login', {'email': email, 'password': password}));

  Future<MeResponse> me() async => MeResponse.fromJson(await get('/me'));

  Future<Dashboard> dashboard(String outletId) async =>
      Dashboard.fromJson(await get('/dashboard', {'outletId': outletId}));

  Future<ForecastsResponse> forecasts(String outletId, {int days = 7}) async =>
      ForecastsResponse.fromJson(
          await get('/forecasts', {'outletId': outletId, 'days': '$days'}));

  Future<PrepPlanResponse> prepPlan(String outletId, {String? date}) async =>
      PrepPlanResponse.fromJson(await get('/prep-plan', {'outletId': outletId, 'date': date}));

  Future<void> approvePrepPlan(String planId) => post('/prep-plan/$planId/approve');

  Future<KitchenResponse> kitchen(String outletId, {String? date}) async =>
      KitchenResponse.fromJson(await get('/kitchen', {'outletId': outletId, 'date': date}));

  Future<void> logKitchen({
    required String outletId,
    required String dishId,
    required Shift shift,
    required int prepared,
    required int sold,
  }) =>
      post('/kitchen/log', {
        'outletId': outletId,
        'dishId': dishId,
        'shift': shift.apiValue,
        'prepared': prepared,
        'sold': sold,
      });

  Future<WasteResponse> waste(String outletId, {int limit = 30}) async =>
      WasteResponse.fromJson(await get('/waste', {'outletId': outletId, 'limit': '$limit'}));

  Future<WasteOptions> wasteOptions(String outletId) async =>
      WasteOptions.fromJson(await get('/waste/options', {'outletId': outletId}));

  Future<String?> logWaste({
    required String outletId,
    String? dishId,
    String? ingredientId,
    required double qty,
    required String unit,
    required String reason,
    String? note,
  }) async {
    final res = await post('/waste', {
      'outletId': outletId,
      'dishId': ?dishId,
      'ingredientId': ?ingredientId,
      'qty': qty,
      'unit': unit,
      'reason': reason,
      if (note != null && note.isNotEmpty) 'note': note,
    });
    return res['id'] as String?;
  }

  Future<AlertsResponse> alerts(String outletId) async =>
      AlertsResponse.fromJson(await get('/alerts', {'outletId': outletId}));

  Future<void> markAlertRead(String alertId) => post('/alerts/$alertId/read');

  Future<DonationsResponse> donations(String outletId) async =>
      DonationsResponse.fromJson(await get('/donations', {'outletId': outletId}));

  Future<String> ask(String outletId, String message) async {
    final res = await post('/assistant', {'outletId': outletId, 'message': message});
    return res['reply'] as String? ?? '';
  }
}
