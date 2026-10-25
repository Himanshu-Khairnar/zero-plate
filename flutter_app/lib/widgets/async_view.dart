import 'package:flutter/material.dart';

import '../api/api_client.dart';

/// Loads data with [load] and shows a spinner, an error with a Retry button,
/// or the [builder] output. Reloads when [reloadKey] changes (e.g. the
/// selected outlet). The builder receives a [refresh] callback suitable for
/// RefreshIndicator.onRefresh.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({
    super.key,
    required this.load,
    required this.builder,
    this.reloadKey,
  });

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() refresh) builder;
  final Object? reloadKey;

  @override
  State<AsyncView<T>> createState() => _AsyncViewState<T>();
}

class _AsyncViewState<T> extends State<AsyncView<T>> {
  T? _data;

  /// Separate flag so a nullable T (e.g. "no plan yet") still counts as loaded.
  bool _hasData = false;
  Object? _error;
  bool _loading = true;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _fetch(clear: true);
  }

  @override
  void didUpdateWidget(covariant AsyncView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reloadKey != widget.reloadKey) _fetch(clear: true);
  }

  Future<void> _fetch({bool clear = false}) async {
    final gen = ++_generation;
    if (clear) {
      setState(() {
        _loading = true;
        _error = null;
        _data = null;
        _hasData = false;
      });
    }
    try {
      final data = await widget.load();
      if (!mounted || gen != _generation) return;
      setState(() {
        _data = data;
        _hasData = true;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || gen != _generation) return;
      if (_hasData) {
        // Keep showing stale data on a failed refresh; tell the user why.
        setState(() => _loading = false);
        showErrorSnackBar(context, e);
      } else {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hasData) return widget.builder(context, _data as T, _fetch);
    if (_loading) return const Center(child: CircularProgressIndicator());
    return ErrorView(error: _error, onRetry: () => _fetch(clear: true));
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});

  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 40, color: theme.colorScheme.error),
            const SizedBox(height: 12),
            Text('Something went wrong', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(errorMessage(error), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

String errorMessage(Object? e) {
  if (e is ApiException) return e.message;
  return e?.toString() ?? 'Unknown error';
}

/// Shows the server message (e.g. for 403 / 409) in a SnackBar.
void showErrorSnackBar(BuildContext context, Object error) {
  final scheme = Theme.of(context).colorScheme;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      backgroundColor: scheme.error,
      content: Text(errorMessage(error), style: TextStyle(color: scheme.onError)),
    ));
}

void showInfoSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
