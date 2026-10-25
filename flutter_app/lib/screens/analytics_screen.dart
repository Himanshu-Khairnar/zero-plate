import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/kpi_card.dart';
import '../widgets/section_card.dart';

/// Read-only analytics: sales, forecast vs actual, waste by reason, savings
/// and why tomorrow's forecast looks the way it does.
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  int _days = 30;

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
        actions: [
          PopupMenuButton<int>(
            tooltip: 'Period',
            initialValue: _days,
            onSelected: (d) => setState(() => _days = d),
            itemBuilder: (_) => [for (final d in const [14, 30, 60, 90]) PopupMenuItem(value: d, child: Text('Last $d days'))],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(children: [Text('${_days}d'), const Icon(Icons.arrow_drop_down)]),
            ),
          ),
        ],
      ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<AnalyticsResponse>(
              reloadKey: (outletId, _days),
              load: () => context.read<ApiClient>().analytics(outletId, days: _days),
              builder: (context, a, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: _AnalyticsBody(a: a, days: _days),
              ),
            ),
    );
  }
}

class _AnalyticsBody extends StatelessWidget {
  const _AnalyticsBody({required this.a, required this.days});

  final AnalyticsResponse a;
  final int days;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final s = a.savings;
    final revenue = a.sales.fold<double>(0, (t, p) => t + p.revenue);
    final plates = a.sales.fold<double>(0, (t, p) => t + p.plates);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: KpiCard(
                label: 'Money saved',
                value: fmtRupees(s.moneySaved),
                hint: s.baselineShare != null && s.currentShare != null
                    ? 'waste ${s.baselineShare}% → ${s.currentShare}% of revenue'
                    : 'not enough history',
                icon: Icons.savings_outlined,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: KpiCard(
                label: 'Waste ${days}d',
                value: '${fmtNum(a.waste.totalPlates)} plates',
                hint: fmtRupees(a.waste.totalCost),
                icon: Icons.delete_outline,
              ),
            ),
          ],
        ),
        if (s.note.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(s.note, style: theme.textTheme.bodySmall?.copyWith(color: muted)),
          ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Sales',
          description: '${fmtNum(plates)} plates · ${fmtRupees(revenue)} in the last $days days',
          child: a.sales.isEmpty
              ? const EmptyState(title: 'No sales yet')
              : SizedBox(height: 180, child: SalesChart(points: a.sales)),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Forecast vs actual',
          description: 'Shaded band = low–high forecast; line = likely; bold = actual plates sold.',
          child: a.accuracy.isEmpty
              ? const EmptyState(title: 'No overlap yet', hint: 'Needs past days with both a forecast and sales.')
              : SizedBox(height: 200, child: AccuracyChart(points: a.accuracy)),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Waste by reason',
          description: 'Cost of waste per reason, last $days days.',
          child: a.waste.byReason.isEmpty
              ? const EmptyState(title: 'No waste logged')
              : SizedBox(height: 180, child: ReasonChart(slices: a.waste.byReason)),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Why tomorrow',
          description: 'Top dishes in tomorrow\'s forecast and what drives them.',
          child: a.explanations.isEmpty
              ? Text('No forecast for tomorrow yet.', style: theme.textTheme.bodySmall?.copyWith(color: muted))
              : Column(
                  children: [
                    for (final e in a.explanations)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(e.dish),
                        subtitle: e.explanation == null ? null : Text(e.explanation!),
                        trailing: Text('${e.likely}', style: theme.textTheme.titleMedium),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

FlTitlesData _titles(Palette p, List<String> dates) => FlTitlesData(
      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      leftTitles: AxisTitles(
        sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 36,
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
          interval: 1,
          getTitlesWidget: (v, meta) {
            final i = v.toInt();
            final step = (dates.length / 6).ceil().clamp(1, 1000);
            if (i < 0 || i >= dates.length || i % step != 0 || v != i.toDouble()) return const SizedBox.shrink();
            return SideTitleWidget(
              meta: meta,
              child: Text(fmtShort(dates[i]), style: TextStyle(fontSize: 9, color: p.mutedForeground)),
            );
          },
        ),
      ),
    );

FlGridData _grid(Palette p) => FlGridData(
      drawVerticalLine: false,
      getDrawingHorizontalLine: (_) => FlLine(color: p.border, strokeWidth: 1),
    );

class SalesChart extends StatelessWidget {
  const SalesChart({super.key, required this.points});

  final List<DayPoint> points;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    return LineChart(LineChartData(
      minY: 0,
      gridData: _grid(p),
      borderData: FlBorderData(show: false),
      titlesData: _titles(p, [for (final d in points) d.date]),
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => p.foreground,
          getTooltipItems: (spots) => [
            for (final s in spots)
              LineTooltipItem(
                '${fmtShort(points[s.x.toInt()].date)}\n${s.y.toStringAsFixed(0)} plates',
                TextStyle(color: p.background, fontSize: 11),
              ),
          ],
        ),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: [for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].plates)],
          color: p.chart[0],
          barWidth: 2,
          dotData: const FlDotData(show: false),
          belowBarData: BarAreaData(show: true, color: p.chart[3].withValues(alpha: 0.25)),
        ),
      ],
    ));
  }
}

class AccuracyChart extends StatelessWidget {
  const AccuracyChart({super.key, required this.points});

  final List<AccuracyPoint> points;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    List<FlSpot> spots(double Function(AccuracyPoint) f) =>
        [for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), f(points[i]))];
    LineChartBarData line(List<FlSpot> s, Color c, double w, {List<int>? dash}) => LineChartBarData(
          spots: s,
          color: c,
          barWidth: w,
          dashArray: dash,
          dotData: const FlDotData(show: false),
        );
    return LineChart(LineChartData(
      minY: 0,
      gridData: _grid(p),
      borderData: FlBorderData(show: false),
      titlesData: _titles(p, [for (final d in points) d.date]),
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => p.foreground,
          getTooltipItems: (spots) => [
            for (final (i, s) in spots.indexed)
              i == 0
                  ? LineTooltipItem(
                      () {
                        final a = points[s.x.toInt()];
                        return '${fmtShort(a.date)}\nactual ${a.actual.round()} · likely ${a.likely.round()}\n'
                            'band ${a.low.round()}–${a.high.round()}';
                      }(),
                      TextStyle(color: p.background, fontSize: 11),
                    )
                  : null,
          ],
        ),
      ),
      betweenBarsData: [BetweenBarsData(fromIndex: 0, toIndex: 1, color: p.chart[4].withValues(alpha: 0.35))],
      lineBarsData: [
        line(spots((a) => a.low), p.chart[4], 1),
        line(spots((a) => a.high), p.chart[4], 1),
        line(spots((a) => a.likely), p.chart[2], 2, dash: [5, 4]),
        line(spots((a) => a.actual), p.chart[0], 3),
      ],
    ));
  }
}

class ReasonChart extends StatelessWidget {
  const ReasonChart({super.key, required this.slices});

  final List<ReasonSlice> slices;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    final maxY = slices.fold<double>(0, (m, s) => s.cost > m ? s.cost : m);
    return BarChart(BarChartData(
      maxY: maxY <= 0 ? 1 : maxY * 1.2,
      gridData: _grid(p),
      borderData: FlBorderData(show: false),
      barTouchData: BarTouchData(
        touchTooltipData: BarTouchTooltipData(
          getTooltipColor: (_) => p.foreground,
          getTooltipItem: (group, _, rod, _) => BarTooltipItem(
            '${reasonLabel(slices[group.x].reason)}\n${fmtRupees(rod.toY)} · ${fmtNum(slices[group.x].plates)} plates',
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
            reservedSize: 44,
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
              if (i < 0 || i >= slices.length) return const SizedBox.shrink();
              return SideTitleWidget(
                meta: meta,
                child: Text(reasonLabel(slices[i].reason), style: TextStyle(fontSize: 9, color: p.mutedForeground)),
              );
            },
          ),
        ),
      ),
      barGroups: [
        for (var i = 0; i < slices.length; i++)
          BarChartGroupData(x: i, barRods: [
            BarChartRodData(
              toY: slices[i].cost,
              color: p.chart[i % p.chart.length],
              width: 22,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
            ),
          ]),
      ],
    ));
  }
}
