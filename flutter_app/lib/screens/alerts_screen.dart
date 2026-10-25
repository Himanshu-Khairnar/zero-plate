import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  int _version = 0;
  bool _busy = false;

  Future<void> _run(Future<String> Function() action) async {
    setState(() => _busy = true);
    try {
      final msg = await action();
      if (!mounted) return;
      showInfoSnackBar(context, msg);
      setState(() => _version++);
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _markAll(String outletId) => _run(() async {
        final n = await context.read<ApiClient>().markAllAlertsRead(outletId);
        return n == 0 ? 'Nothing to mark' : 'Marked $n alert${n == 1 ? '' : 's'} as read';
      });

  void _scan(String outletId) => _run(() async {
        final n = await context.read<ApiClient>().scanAnomalies(outletId);
        return n == 0 ? 'Scan finished: no new anomalies' : 'Scan finished: $n new alert${n == 1 ? '' : 's'}';
      });

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    final canManage = context.watch<AuthProvider>().user?.canManage ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Alerts'),
        actions: [
          if (outletId != null) ...[
            if (canManage)
              IconButton(
                tooltip: 'Run anomaly scan',
                onPressed: _busy ? null : () => _scan(outletId),
                icon: const Icon(Icons.manage_search),
              ),
            IconButton(
              tooltip: 'Mark all read',
              onPressed: _busy ? null : () => _markAll(outletId),
              icon: const Icon(Icons.done_all),
            ),
          ],
        ],
        bottom: _busy ? const PreferredSize(preferredSize: Size.fromHeight(4), child: LinearProgressIndicator()) : null,
      ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<AlertsResponse>(
              reloadKey: (outletId, _version),
              load: () => context.read<ApiClient>().alerts(outletId),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: _AlertList(items: res.items),
              ),
            ),
    );
  }
}

class _AlertList extends StatefulWidget {
  const _AlertList({required this.items});

  final List<AlertItem> items;

  @override
  State<_AlertList> createState() => _AlertListState();
}

class _AlertListState extends State<_AlertList> {
  /// Alerts marked read in this session (optimistic update).
  final Set<String> _readNow = {};

  Future<void> _markRead(AlertItem a) async {
    setState(() => _readNow.add(a.id));
    try {
      await context.read<ApiClient>().markAlertRead(a.id);
    } catch (e) {
      if (!mounted) return;
      setState(() => _readNow.remove(a.id));
      showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [EmptyState(icon: Icons.notifications_none, title: 'No alerts', hint: 'You are all caught up.')],
      );
    }
    final scheme = Theme.of(context).colorScheme;
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: widget.items.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final a = widget.items[i];
        final read = a.read || _readNow.contains(a.id);
        final (icon, color) = switch (a.severity) {
          'critical' => (Icons.error_outline, scheme.error),
          'warning' => (Icons.warning_amber, scheme.primary),
          _ => (Icons.info_outline, scheme.onSurfaceVariant),
        };
        return Opacity(
          opacity: read ? 0.6 : 1,
          child: Card(
            child: ListTile(
              leading: Icon(icon, color: color),
              title: Text(a.title, style: TextStyle(fontWeight: read ? FontWeight.normal : FontWeight.w700)),
              subtitle: Text('${a.message}\n${fmtDateTime(a.createdAt)}'),
              isThreeLine: true,
              trailing: read
                  ? null
                  : IconButton(
                      tooltip: 'Mark as read',
                      icon: const Icon(Icons.done),
                      onPressed: () => _markRead(a),
                    ),
            ),
          ),
        );
      },
    );
  }
}
