import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:wasteless/api/api_client.dart';
import 'package:wasteless/models/models.dart';
import 'package:wasteless/state/auth_provider.dart';
import 'package:wasteless/state/outlet_provider.dart';
import 'package:wasteless/theme.dart';

/// Requests seen by the mock server, as "METHOD /path".
final requests = <String>[];

/// Pumps [screen] signed in as [role]. [routes] maps "/api/mobile" paths
/// (without query) to JSON bodies; "METHOD /path" keys win over plain paths.
Future<ApiClient> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  required String role,
  Map<String, Object?> routes = const {},
}) async {
  requests.clear();
  // Tall surface so long lists build every row.
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1.5;
  addTearDown(tester.view.reset);
  final api = ApiClient(
    baseUrl: 'http://test',
    httpClient: MockClient((req) async {
      final path = req.url.path.replaceFirst('/api/mobile', '');
      requests.add('${req.method} $path');
      final key = routes.containsKey('${req.method} $path') ? '${req.method} $path' : path;
      if (!routes.containsKey(key)) return http.Response(jsonEncode({'error': 'no mock for $key'}), 404);
      return http.Response(jsonEncode(routes[key]), 200);
    }),
  );
  final auth = AuthProvider(api)
    ..user = User(id: 'u1', name: 'Test User', email: 't@x', roleName: role, organizationName: 'Org')
    ..outlets = const [Outlet(id: 'o1', name: 'Main'), Outlet(id: 'o2', name: 'Second')]
    ..status = AuthStatus.signedIn;
  await tester.pumpWidget(MultiProvider(
    providers: [
      Provider<ApiClient>.value(value: api),
      ChangeNotifierProvider<AuthProvider>.value(value: auth),
      ChangeNotifierProvider<OutletProvider>(create: (_) => OutletProvider()..updateOutlets(auth.outlets)),
    ],
    child: MaterialApp(
      theme: buildTheme(Brightness.light, useGoogleFonts: false),
      home: screen,
    ),
  ));
  await tester.pumpAndSettle();
  return api;
}

Map<String, dynamic> planViewJson({String status = 'DRAFT'}) => {
      'id': 'p1',
      'outletId': 'o1',
      'date': '2026-10-26',
      'status': status,
      'approvedBy': status == 'DRAFT' ? null : 'Asha Owner',
      'approvedAt': status == 'DRAFT' ? null : '2026-10-25T18:00:00.000Z',
      'notes': null,
      'modelVersion': 'lgbm-v3',
      'items': [
        {
          'id': 'i1',
          'dishId': 'd1',
          'dishName': 'Dal Tadka',
          'category': 'Main',
          'price': 180,
          'forecastLow': 30.4,
          'forecastLikely': 38.2,
          'forecastHigh': 47.9,
          'riskWeight': 0.8,
          'costPerPlate': 42.5,
          'suggestedQty': 46,
          'plannedQty': 40,
          'explanation': 'Sunday lunch peak; light rain expected',
          'recipe': [
            {'ingredientId': 'g1', 'name': 'Toor dal', 'unit': 'kg', 'costPerUnit': 140, 'qtyPerPlate': 0.08},
          ],
        },
      ],
      'ingredients': [
        {
          'ingredientId': 'g1',
          'name': 'Toor dal',
          'unit': 'kg',
          'qty': 3.2,
          'cost': 448,
          'dishes': [
            {'dishName': 'Dal Tadka', 'qty': 3.2},
          ],
        },
      ],
      'totals': {'plates': 40, 'prepCost': 1700, 'forecastLikely': 38},
      'adjustments': [
        {
          'id': 'a1',
          'dishName': 'Dal Tadka',
          'fromQty': 46,
          'toQty': 40,
          'reason': 'Fewer bookings',
          'adjustedBy': 'Manager',
          'createdAt': '2026-10-25T17:30:00.000Z',
        },
      ],
    };
