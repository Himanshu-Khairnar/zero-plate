import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

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
  /// [AppConfig.apiUrl].
  String baseUrl;

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

  Future<Map<String, dynamic>> delete(String path, [Map<String, String?>? query]) =>
      _send(() => _http.delete(_uri(path, query), headers: _headers));

  /// multipart/form-data POST with text [fields] and one file part.
  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required Map<String, String> fields,
    required String fileField,
    required List<int> bytes,
    required String filename,
  }) =>
      _send(() async {
        final req = http.MultipartRequest('POST', _uri(path))
          ..headers.addAll({
            'Accept': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          })
          ..fields.addAll(fields)
          ..files.add(http.MultipartFile.fromBytes(
            fileField,
            bytes,
            filename: filename,
            contentType: MediaType.parse(imageMimeType(filename)),
          ));
        return http.Response.fromStream(await _http.send(req));
      });

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

  // ---- v2 (feature parity) ---------------------------------------------

  Future<PlanView?> prepPlanFull(String outletId, {String? date}) async =>
      planFromResponse(await get('/prep-plan/full', {'outletId': outletId, 'date': date}));

  Future<PlanView> generatePrepPlan(String outletId, String date) async =>
      planFromResponse(await post('/prep-plan/generate', {'outletId': outletId, 'date': date}))!;

  Future<PlanView> adjustPrepPlan(String planId, List<({String dishId, int plannedQty, String? reason})> changes) async =>
      planFromResponse(await post('/prep-plan/$planId/adjust', {
        'changes': [
          for (final c in changes)
            {
              'dishId': c.dishId,
              'plannedQty': c.plannedQty,
              if (c.reason != null && c.reason!.isNotEmpty) 'reason': c.reason,
            },
        ],
      }))!;

  Future<void> approvePrepPlanWithNotes(String planId, {String? notes}) =>
      post('/prep-plan/$planId/approve', {if (notes != null && notes.isNotEmpty) 'notes': notes});

  Future<int> logLeftovers(String outletId, String date) async =>
      toIntOrZero((await post('/kitchen/leftovers', {'outletId': outletId, 'date': date}))['logged']);

  Future<void> lockDay(String outletId, String date) =>
      post('/kitchen/lock', {'outletId': outletId, 'date': date});

  Future<VisionResult> recognizeWaste(String outletId, List<int> bytes, String filename) async =>
      VisionResult.fromJson(await postMultipart(
        '/waste/recognize',
        fields: {'outletId': outletId},
        fileField: 'photo',
        bytes: bytes,
        filename: filename,
      ));

  Future<void> deleteWaste(String outletId, String id) => delete('/waste/$id', {'outletId': outletId});

  Future<int> markAllAlertsRead(String outletId) async =>
      toIntOrZero((await post('/alerts/read-all', {'outletId': outletId}))['updated']);

  Future<int> scanAnomalies(String outletId) async =>
      toIntOrZero((await post('/alerts/scan', {'outletId': outletId}))['created']);

  Future<SurplusEstimate> suggestSurplus(String outletId, {String? date}) async =>
      SurplusEstimate.fromJson(await get('/donations/suggest', {'outletId': outletId, 'date': date}));

  Future<List<Ngo>> ngos(String outletId) async =>
      ngosFromResponse(await get('/donations/ngos', {'outletId': outletId}));

  Future<String?> createDonation({
    required String outletId,
    String? ngoId,
    required String date,
    required int meals,
    String? dishNames,
    String? note,
  }) async {
    final res = await post('/donations', {
      'outletId': outletId,
      'ngoId': ?ngoId,
      'date': date,
      'meals': meals,
      if (dishNames != null && dishNames.isNotEmpty) 'dishNames': dishNames,
      if (note != null && note.isNotEmpty) 'note': note,
    });
    return res['id'] as String?;
  }

  Future<void> setDonationStatus(String outletId, String id, String status) =>
      post('/donations/$id/status', {'outletId': outletId, 'status': status});

  Future<AnalyticsResponse> analytics(String outletId, {int days = 30}) async =>
      AnalyticsResponse.fromJson(await get('/analytics', {'outletId': outletId, 'days': '$days'}));

  Future<HeatmapResponse> wasteHeatmap(String outletId, {int days = 56}) async =>
      HeatmapResponse.fromJson(await get('/waste-heatmap', {'outletId': outletId, 'days': '$days'}));

  Future<InventoryResponse> inventory(String outletId) async =>
      InventoryResponse.fromJson(await get('/inventory', {'outletId': outletId}));

  Future<WhatIfResult> whatIf(String outletId, String date, WhatIfScenario scenario) async =>
      WhatIfResult.fromJson(await post('/whatif', {'outletId': outletId, 'date': date, 'scenario': scenario.toJson()}));

  /// Returns the invite link.
  Future<String> inviteStaff({required String email, required String role, required List<String> outletIds}) async {
    final res = await post('/staff/invite', {'email': email, 'role': role, 'outletIds': outletIds});
    return res['inviteUrl'] as String? ?? '';
  }

  Future<String> ask(String outletId, String message) async {
    final res = await post('/assistant', {'outletId': outletId, 'message': message});
    return res['reply'] as String? ?? '';
  }
}

int toIntOrZero(Object? v) => v is num ? v.round() : 0;

/// MIME type for a photo file name (the server checks the part's type).
String imageMimeType(String filename) {
  final ext = filename.toLowerCase().split('.').last;
  return switch (ext) {
    'png' => 'image/png',
    'webp' => 'image/webp',
    'heic' => 'image/heic',
    'heif' => 'image/heif',
    _ => 'image/jpeg',
  };
}
