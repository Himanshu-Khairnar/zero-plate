import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/kpi_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outlets = context.watch<OutletProvider>();
    final user = context.watch<AuthProvider>().user;
    final outletId = outlets.outletId;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Hi, ${user?.name.split(' ').first ?? ''}'),
            Text(outlets.outlet?.name ?? 'No outlet', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Alerts',
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/alerts'),
          ),
        ],
      ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets', hint: 'Your account has no outlets yet.')
          : AsyncView<Dashboard>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().dashboard(outletId),
              builder: (context, d, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: _DashboardBody(d: d),
              ),
            ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.d});

  final Dashboard d;

  @override
  Widget build(BuildContext context) {
    final k = d.kpis;
    final theme = Theme.of(context);
    final cards = [
      KpiCard(label: 'Forecast today', value: fmtNum(k.forecastCovers), hint: 'covers', icon: Icons.trending_up),
      KpiCard(label: 'Waste 30d', value: '${fmtNum1(k.wasteKg)} kg', hint: fmtRupees(k.wasteValue), icon: Icons.delete_outline),
      KpiCard(label: 'Revenue 30d', value: fmtRupees(k.revenue), icon: Icons.payments_outlined),
      KpiCard(
        label: 'Accuracy',
        value: k.accuracyPct == null ? '—' : '${k.accuracyPct!.toStringAsFixed(1)}%',
        hint: k.accuracyPct == null ? 'not enough data yet' : '28-day forecast',
        icon: Icons.track_changes,
      ),
      KpiCard(label: 'Meals donated', value: fmtNum(k.mealsDonated), hint: 'this month', icon: Icons.volunteer_activism_outlined),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Text(fmtDay(d.date), style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, c) {
          final cols = c.maxWidth > 600 ? 3 : 2;
          final w = (c.maxWidth - (cols - 1) * 12) / cols;
          return Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [for (final card in cards) SizedBox(width: w, child: card)],
          );
        }),
        const SizedBox(height: 16),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: Badge(
                  isLabelVisible: d.alertsOpen > 0,
                  label: Text('${d.alertsOpen}'),
                  child: const Icon(Icons.notifications_outlined),
                ),
                title: const Text('Open alerts'),
                subtitle: Text(d.alertsOpen == 0 ? 'All clear' : '${d.alertsOpen} unread'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/alerts'),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.assignment_outlined),
                title: const Text("Tomorrow's prep plan"),
                subtitle: Text(_prepLabel(d.prepStatus)),
                trailing: _StatusChip(status: d.prepStatus),
                onTap: () => context.go('/prep'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Waste, last 14 days (kg)', style: theme.textTheme.titleSmall),
                const SizedBox(height: 16),
                SizedBox(height: 180, child: WasteTrendChart(points: d.wasteTrend)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static String _prepLabel(String s) => switch (s) {
        'APPROVED' => 'Approved and ready for the kitchen',
        'DRAFT' => 'Draft waiting for approval',
        _ => 'Not drafted yet (drafted on the web)',
      };
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = status == 'APPROVED' ? scheme.primary : scheme.onSurfaceVariant;
    return Chip(
      label: Text(status, style: TextStyle(color: color, fontSize: 11)),
      side: BorderSide(color: color),
      visualDensity: VisualDensity.compact,
    );
  }
}

/// 14-day waste bar chart (fl_chart).
class WasteTrendChart extends StatelessWidget {
  const WasteTrendChart({super.key, required this.points});

  final List<WastePoint> points;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    final maxY = points.fold<double>(0, (m, e) => e.wasteKg > m ? e.wasteKg : m);
    return BarChart(
      BarChartData(
        maxY: maxY <= 0 ? 1 : maxY * 1.2,
        gridData: FlGridData(
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(color: p.border, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => p.foreground,
            getTooltipItem: (group, _, rod, _) => BarTooltipItem(
              '${fmtShort(points[group.x].date)}\n${rod.toY.toStringAsFixed(1)} kg',
              TextStyle(color: p.background, fontSize: 11),
            ),
          ),
        ),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 32,
              getTitlesWidget: (v, meta) => SideTitleWidget(
                meta: meta,
                child: Text(v.toStringAsFixed(0), style: TextStyle(fontSize: 10, color: p.mutedForeground)),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              getTitlesWidget: (v, meta) {
                final i = v.toInt();
                // Label every other day to avoid crowding.
                if (i < 0 || i >= points.length || i.isOdd) return const SizedBox.shrink();
                return SideTitleWidget(
                  meta: meta,
                  child: Text(fmtShort(points[i].date), style: TextStyle(fontSize: 9, color: p.mutedForeground)),
                );
              },
            ),
          ),
        ),
        barGroups: [
          for (var i = 0; i < points.length; i++)
            BarChartGroupData(x: i, barRods: [
              BarChartRodData(
                toY: points[i].wasteKg,
                color: i == points.length - 1 ? p.chart[0] : p.chart[2],
                width: 12,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
              ),
            ]),
        ],
      ),
    );
  }
}
