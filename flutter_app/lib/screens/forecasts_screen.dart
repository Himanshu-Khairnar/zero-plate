import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

/// Next 7 days of demand forecasts, one expandable card per day.
class ForecastsScreen extends StatelessWidget {
  const ForecastsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Forecasts')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<ForecastsResponse>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().forecasts(outletId, days: 7),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  itemCount: res.days.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) => _DayCard(day: res.days[i], initiallyExpanded: i == 0),
                ),
              ),
            ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({required this.day, required this.initiallyExpanded});

  final ForecastDay day;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        shape: const Border(),
        title: Text(fmtDay(day.date)),
        subtitle: Text(day.items.isEmpty ? 'No forecast' : '${day.totalLikely} plates likely'),
        children: [
          if (day.items.isEmpty)
            const Padding(padding: EdgeInsets.all(16), child: Text('No forecast for this day yet.'))
          else
            for (final it in day.items)
              ListTile(
                dense: true,
                title: Text(it.dishName),
                subtitle: Text('range ${it.low}–${it.high}'),
                trailing: Text('${it.likely}',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              ),
        ],
      ),
    );
  }
}
