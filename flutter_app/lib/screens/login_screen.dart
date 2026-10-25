import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../state/auth_provider.dart';
import '../widgets/async_view.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _server = TextEditingController();
  bool _showServer = false;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _server.text = context.read<AuthProvider>().api.baseUrl;
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _server.dispose();
    super.dispose();
  }

  void _fillDemo() {
    _email.text = AppConfig.demoEmail;
    _password.text = AppConfig.demoPassword;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      if (ApiClient.normalizeUrl(_server.text) != auth.api.baseUrl) {
        await auth.api.saveBaseUrl(_server.text);
        if (mounted) _server.text = auth.api.baseUrl;
      }
      // On success the router redirects to Home.
      await auth.login(_email.text, _password.text);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.eco, size: 48, color: theme.colorScheme.primary),
                    const SizedBox(height: 8),
                    Text('Zero Plate',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                    Text('Cook what sells. Waste less.',
                        textAlign: TextAlign.center, style: theme.textTheme.bodyMedium?.copyWith(color: muted)),
                    const SizedBox(height: 32),
                    TextFormField(
                      key: const Key('email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
                      validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('password'),
                      controller: _password,
                      obscureText: _obscure,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: 24),
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.info_outline),
                        title: const Text('Demo account'),
                        subtitle: Text('${AppConfig.demoEmail}\n${AppConfig.demoPassword}'),
                        isThreeLine: true,
                        trailing: TextButton(onPressed: _fillDemo, child: const Text('Use')),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      key: const Key('serverToggle'),
                      onPressed: () => setState(() => _showServer = !_showServer),
                      icon: const Icon(Icons.dns_outlined, size: 18),
                      label: Text(_showServer ? 'Hide server settings' : 'Server: ${_server.text}',
                          overflow: TextOverflow.ellipsis),
                      style: TextButton.styleFrom(foregroundColor: muted),
                    ),
                    if (_showServer) ...[
                      const SizedBox(height: 8),
                      TextFormField(
                        key: const Key('server'),
                        controller: _server,
                        keyboardType: TextInputType.url,
                        autocorrect: false,
                        decoration: InputDecoration(
                          labelText: 'Server',
                          helperText: 'Saved on this device. Clear it to use the default.',
                          prefixIcon: const Icon(Icons.dns_outlined),
                          suffixIcon: IconButton(
                            tooltip: 'Reset to default',
                            icon: const Icon(Icons.restart_alt),
                            onPressed: () => setState(() => _server.text = AppConfig.apiUrl),
                          ),
                        ),
                        validator: (v) {
                          final u = ApiClient.normalizeUrl(v ?? '');
                          if (u.isEmpty) return null;
                          final uri = Uri.tryParse(u);
                          return (uri == null || !uri.hasAuthority) ? 'Enter a URL like https://example.com' : null;
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
