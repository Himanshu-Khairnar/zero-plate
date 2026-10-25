import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

/// Recent waste entries for the outlet, with a button to log a new one.
class WasteScreen extends StatefulWidget {
  const WasteScreen({super.key});

  @override
  State<WasteScreen> createState() => _WasteScreenState();
}

class _WasteScreenState extends State<WasteScreen> {
  /// Bumped after logging waste so the list reloads.
  int _version = 0;

  Future<void> _openLog() async {
    final saved = await context.push<bool>('/waste-log');
    if (saved == true && mounted) setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Waste')),
      floatingActionButton: outletId == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _openLog,
              icon: const Icon(Icons.add),
              label: const Text('Log waste'),
            ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<WasteResponse>(
              reloadKey: (outletId, _version),
              load: () => context.read<ApiClient>().waste(outletId),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: res.items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: const [
                          EmptyState(
                            icon: Icons.delete_outline,
                            title: 'No waste logged yet',
                            hint: 'Tap "Log waste" to record overproduction, spoilage and more.',
                          ),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                        itemCount: res.items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, i) => _WasteTile(item: res.items[i]),
                      ),
              ),
            ),
    );
  }
}

class _WasteTile extends StatelessWidget {
  const _WasteTile({required this.item});

  final WasteItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final qty = item.qty == item.qty.roundToDouble() ? item.qty.toStringAsFixed(0) : item.qty.toStringAsFixed(2);
    return Card(
      child: ListTile(
        leading: Icon(item.dishName != null ? Icons.restaurant : Icons.egg_outlined),
        title: Text(item.name),
        subtitle: Text('${fmtDay(item.date)} · ${reasonLabel(item.reason)}'),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('$qty ${item.unit}', style: theme.textTheme.titleSmall),
            Text(fmtRupees(item.value), style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
