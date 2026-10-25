import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'router.dart';
import 'state/auth_provider.dart';
import 'state/outlet_provider.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final auth = AuthProvider(api)..bootstrap();
  runApp(WasteLessApp(api: api, auth: auth));
}

class WasteLessApp extends StatefulWidget {
  const WasteLessApp({super.key, required this.api, required this.auth});

  final ApiClient api;
  final AuthProvider auth;

  @override
  State<WasteLessApp> createState() => _WasteLessAppState();
}

class _WasteLessAppState extends State<WasteLessApp> {
  late final GoRouter _router = buildRouter(widget.auth);

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: widget.api),
        ChangeNotifierProvider<AuthProvider>.value(value: widget.auth),
        ChangeNotifierProxyProvider<AuthProvider, OutletProvider>(
          create: (_) => OutletProvider(),
          update: (_, auth, outlets) => (outlets ?? OutletProvider())..updateOutlets(auth.outlets),
        ),
      ],
      child: MaterialApp.router(
        title: 'Zero Plate',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: ThemeMode.system,
        routerConfig: _router,
      ),
    );
  }
}
