import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wasteless/api/api_client.dart';
import 'package:wasteless/screens/login_screen.dart';
import 'package:wasteless/state/auth_provider.dart';
import 'package:wasteless/theme.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  Widget wrap(AuthProvider auth) => ChangeNotifierProvider.value(
        value: auth,
        child: MaterialApp(
          // Google Fonts would fetch over the network; tests use the default font.
          theme: buildTheme(Brightness.light, useGoogleFonts: false),
          home: const LoginScreen(),
        ),
      );

  testWidgets('shows the demo hint and fills it in', (tester) async {
    final auth = AuthProvider(ApiClient(httpClient: MockClient((_) async => http.Response('{}', 200))));
    await tester.pumpWidget(wrap(auth));

    expect(find.text('Zero Plate'), findsOneWidget);
    expect(find.textContaining('owner@wasteless.local'), findsOneWidget);

    await tester.tap(find.text('Use'));
    await tester.pump();
    final email = tester.widget<TextFormField>(find.byKey(const Key('email')));
    expect(email.controller!.text, 'owner@wasteless.local');
  });

  testWidgets('validates empty fields', (tester) async {
    final auth = AuthProvider(ApiClient(httpClient: MockClient((_) async => http.Response('{}', 200))));
    await tester.pumpWidget(wrap(auth));

    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.text('Enter a valid email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });

  testWidgets('shows the server error message on bad credentials', (tester) async {
    final client = MockClient((req) async {
      expect(req.url.path, '/api/mobile/auth/login');
      return http.Response(jsonEncode({'error': 'Invalid email or password'}), 401);
    });
    final auth = AuthProvider(ApiClient(httpClient: client, baseUrl: 'http://test'));
    await tester.pumpWidget(wrap(auth));

    await tester.enterText(find.byKey(const Key('email')), 'x@y.z');
    await tester.enterText(find.byKey(const Key('password')), 'wrong');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(auth.isSignedIn, isFalse);
  });

  testWidgets('signs in on success', (tester) async {
    final client = MockClient((_) async => http.Response(
          jsonEncode({
            'token': 't0k3n',
            'user': {'id': 'u1', 'name': 'Owner', 'email': 'owner@wasteless.local', 'role': 'OWNER', 'organizationName': 'Org'},
            'outlets': [
              {'id': 'o1', 'name': 'Main'},
            ],
          }),
          200,
        ));
    final api = ApiClient(httpClient: client, baseUrl: 'http://test');
    final auth = AuthProvider(api);
    await tester.pumpWidget(wrap(auth));

    await tester.tap(find.text('Use'));
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(auth.isSignedIn, isTrue);
    expect(api.token, 't0k3n');
    expect(auth.outlets.single.name, 'Main');
  });
}
