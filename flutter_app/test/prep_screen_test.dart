import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wasteless/api/api_client.dart';
import 'package:wasteless/models/models.dart';
import 'package:wasteless/screens/prep_screen.dart';
import 'package:wasteless/state/auth_provider.dart';
import 'package:wasteless/state/outlet_provider.dart';
import 'package:wasteless/theme.dart';

Map<String, dynamic> _plan(String status) => {
      'plan': {
        'id': 'p1',
        'date': '2026-10-25',
        'status': status,
        'items': [
          {'id': 'i1', 'dishId': 'd1', 'dishName': 'Dal Tadka', 'forecastQty': 40, 'plannedQty': 38, 'unit': 'plates'},
        ],
      },
    };

Future<void> _pump(WidgetTester tester, {required String role, required Map<String, dynamic> body}) async {
  final api = ApiClient(
    baseUrl: 'http://test',
    httpClient: MockClient((_) async => http.Response(jsonEncode(body), 200)),
  );
  final auth = AuthProvider(api)
    ..user = User(id: 'u1', name: 'Test', email: 't@x', roleName: role, organizationName: 'Org')
    ..outlets = const [Outlet(id: 'o1', name: 'Main')]
    ..status = AuthStatus.signedIn;
  await tester.pumpWidget(MultiProvider(
    providers: [
      Provider<ApiClient>.value(value: api),
      ChangeNotifierProvider<AuthProvider>.value(value: auth),
      ChangeNotifierProvider<OutletProvider>(create: (_) => OutletProvider()..updateOutlets(auth.outlets)),
    ],
    child: MaterialApp(
      theme: buildTheme(Brightness.light, useGoogleFonts: false),
      home: const PrepScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('OWNER sees Approve on a DRAFT plan', (tester) async {
    await _pump(tester, role: 'OWNER', body: _plan('DRAFT'));
    expect(find.text('Dal Tadka'), findsOneWidget);
    expect(find.text('Approve plan'), findsOneWidget);
  });

  testWidgets('MANAGER sees Approve on a DRAFT plan', (tester) async {
    await _pump(tester, role: 'MANAGER', body: _plan('DRAFT'));
    expect(find.text('Approve plan'), findsOneWidget);
  });

  testWidgets('KITCHEN_STAFF does not see Approve', (tester) async {
    await _pump(tester, role: 'KITCHEN_STAFF', body: _plan('DRAFT'));
    expect(find.text('Approve plan'), findsNothing);
    expect(find.text('Waiting for an owner or manager to approve.'), findsOneWidget);
  });

  testWidgets('LOCKED plan is shown as approved, no Approve button', (tester) async {
    await _pump(tester, role: 'OWNER', body: _plan('LOCKED'));
    expect(find.text('APPROVED'), findsOneWidget);
    expect(find.text('Approve plan'), findsNothing);
  });

  testWidgets('null plan shows the drafted-on-web empty state', (tester) async {
    await _pump(tester, role: 'OWNER', body: {'plan': null});
    expect(find.text('No plan for tomorrow yet'), findsOneWidget);
  });
}
