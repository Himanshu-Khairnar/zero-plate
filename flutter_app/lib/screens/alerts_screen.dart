import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Alerts')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<AlertsResponse>(
              reloadKey: outletId,
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
