import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/section_card.dart';

/// Read-only stock levels (LOW/OUT, expiry) and suggested purchase orders.
class InventoryScreen extends StatelessWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Inventory'),
          bottom: const TabBar(tabs: [Tab(text: 'Stock'), Tab(text: 'Suggested orders')]),
        ),
        body: outletId == null
            ? const EmptyState(title: 'No outlets')
            : AsyncView<InventoryResponse>(
                reloadKey: outletId,
                load: () => context.read<ApiClient>().inventory(outletId),
                builder: (context, res, refresh) => TabBarView(
                  children: [
                    RefreshIndicator(onRefresh: refresh, child: _StockList(rows: res.rows)),
                    RefreshIndicator(onRefresh: refresh, child: _OrderList(orders: res.suggestedOrders)),
                  ],
                ),
              ),
      ),
    );
  }
}

/// Most urgent first (same weighting as the web stock tab).
int _urgency(StockRow r) =>
    (r.status == 'OUT' ? 4 : r.status == 'LOW' ? 2 : 0) +
    (r.expiryState == 'expired' ? 3 : r.expiryState == 'soon' ? 1 : 0);

class _StockList extends StatelessWidget {
  const _StockList({required this.rows});

  final List<StockRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [EmptyState(icon: Icons.inventory_2_outlined, title: 'No ingredients yet')],
      );
    }
    final sorted = [...rows]..sort((a, b) => _urgency(b).compareTo(_urgency(a)) != 0
        ? _urgency(b).compareTo(_urgency(a))
        : a.name.compareTo(b.name));
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final low = rows.where((r) => r.status != 'OK').length;
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: sorted.length + 1,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        if (i == 0) {
          return Text('${rows.length} ingredients · $low low or out',
              style: theme.textTheme.bodySmall?.copyWith(color: muted));
        }
        final r = sorted[i - 1];
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(r.name, style: theme.textTheme.titleSmall)),
                    Text('${fmtQty(r.onHand)} ${r.unit}', style: theme.textTheme.titleMedium),
                  ],
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (r.status == 'OUT') const Tag('OUT', danger: true),
                    if (r.status == 'LOW') const Tag('LOW', strong: true),
                    if (r.status == 'OK') const Tag('OK'),
                    if (r.expiryState == 'expired') const Tag('Expired', danger: true),
                    if (r.expiryState == 'soon') const Tag('Use first'),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    'uses ${fmtQty(r.dailyUsage)} ${r.unit}/day',
                    r.daysOfCover == null ? 'no recent usage' : '${r.daysOfCover!.toStringAsFixed(1)} days of cover',
                    'reorder at ${fmtQty(r.reorderPoint)}',
                  ].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(color: muted),
                ),
                if (r.nextExpiry != null)
                  Text('Next expiry ${fmtDay(r.nextExpiry!)}', style: theme.textTheme.bodySmall?.copyWith(color: muted)),
                if (r.cheapestSupplier != null)
                  Text(
                    'Cheapest: ${r.cheapestSupplier!.name} · ${fmtRupees(r.cheapestSupplier!.price)}/${r.unit} · ${r.cheapestSupplier!.leadTimeDays}d lead',
                    style: theme.textTheme.bodySmall?.copyWith(color: muted),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OrderList extends StatelessWidget {
  const _OrderList({required this.orders});

  final List<SuggestedOrder> orders;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    if (orders.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          EmptyState(
            icon: Icons.shopping_cart_outlined,
            title: 'Nothing to order',
            hint: 'Stock covers expected usage over each supplier\'s lead time.',
          ),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Text('Suggested from daily usage × (lead time + 1 day buffer). Orders are placed on the web app.',
            style: theme.textTheme.bodySmall?.copyWith(color: muted)),
        const SizedBox(height: 8),
        for (final o in orders) ...[
          SectionCard(
            title: o.supplierName ?? 'No supplier',
            description: 'Lead ${o.leadTimeDays}d · arrives ${fmtDay(o.expectedDate)} · ${fmtRupees(o.total)}',
            child: Column(
              children: [
                for (final it in o.items)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(it.name),
                    subtitle: Text('on hand ${fmtQty(it.onHand)} · need ${fmtQty(it.need)} ${it.unit}'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${fmtQty(it.qty)} ${it.unit}', style: theme.textTheme.titleSmall),
                        Text(fmtRupees(it.total), style: theme.textTheme.bodySmall?.copyWith(color: muted)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}
