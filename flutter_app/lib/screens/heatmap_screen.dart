import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// Dish × weekday grid of wasted plates (last 8 weeks), coloured with shades
/// of the theme palette.
class HeatmapScreen extends StatelessWidget {
  const HeatmapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Waste heatmap')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<HeatmapResponse>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().wasteHeatmap(outletId),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text('Plates wasted per dish and weekday, last 8 weeks. Darker = more waste; tap a cell for the cost.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 12),
                    if (res.cells.isEmpty)
                      const EmptyState(icon: Icons.grid_on, title: 'No dish waste logged yet')
                    else
                      HeatmapGrid(cells: res.cells),
                  ],
                ),
              ),
            ),
    );
  }
}

/// Palette shade for a 0..1 intensity: card colour → lightest chart shade → primary.
Color heatColor(Palette p, double t) {
  if (t <= 0) return p.card;
  // chart[] runs from strongest to lightest in light mode; order by luminance so dark mode works too.
  final shades = [...p.chart]..sort((a, b) => b.computeLuminance().compareTo(a.computeLuminance()));
  if (p.background.computeLuminance() < 0.2) shades.setAll(0, shades.reversed.toList());
  final i = (t * (shades.length - 1)).round().clamp(0, shades.length - 1);
  return shades[i];
}

class HeatmapGrid extends StatelessWidget {
  const HeatmapGrid({super.key, required this.cells});

  final List<HeatCell> cells;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    final theme = Theme.of(context);
    final dishes = <String, String>{for (final c in cells) c.dishId: c.dishName};
    final byKey = {for (final c in cells) '${c.dishId}|${c.weekday}': c};
    final maxPlates = cells.fold<double>(0, (m, c) => c.plates > m ? c.plates : m);
    final order = dishes.keys.toList()
      ..sort((a, b) {
        double total(String id) => cells.where((c) => c.dishId == id).fold(0, (s, c) => s + c.plates);
        return total(b).compareTo(total(a));
      });

    Widget cell(HeatCell? c) {
      final t = c == null || maxPlates <= 0 ? 0.0 : c.plates / maxPlates;
      final bg = heatColor(p, t);
      final fg = bg.computeLuminance() > 0.4 ? p.foreground : p.primaryForeground;
      return Tooltip(
        message: c == null ? 'No waste' : '${c.dishName}, ${_weekdays[c.weekday.clamp(0, 6)]}: ${fmtNum(c.plates)} plates · ${fmtRupees(c.cost)}',
        triggerMode: TooltipTriggerMode.tap,
        child: Container(
          height: 36,
          margin: const EdgeInsets.all(1.5),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: p.border),
          ),
          child: Text(c == null || c.plates == 0 ? '' : fmtNum(c.plates),
              style: theme.textTheme.labelSmall?.copyWith(color: fg)),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const SizedBox(width: 110),
            for (final d in _weekdays)
              Expanded(child: Text(d, textAlign: TextAlign.center, style: theme.textTheme.labelSmall)),
          ],
        ),
        const SizedBox(height: 4),
        for (final id in order)
          Row(
            children: [
              SizedBox(
                width: 110,
                child: Text(dishes[id]!, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
              ),
              for (var w = 0; w < 7; w++) Expanded(child: cell(byKey['$id|$w'])),
            ],
          ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Text('less ', style: theme.textTheme.labelSmall),
            for (final t in const [0.0, 0.25, 0.5, 0.75, 1.0])
              Container(
                width: 18,
                height: 12,
                margin: const EdgeInsets.symmetric(horizontal: 1),
                decoration: BoxDecoration(color: heatColor(p, t), border: Border.all(color: p.border)),
              ),
            Text(' more', style: theme.textTheme.labelSmall),
          ],
        ),
      ],
    );
  }
}
