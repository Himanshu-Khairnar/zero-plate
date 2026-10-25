import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/kpi_card.dart';

class DonationsScreen extends StatelessWidget {
  const DonationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Donations')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<DonationsResponse>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().donations(outletId),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  children: [
                    KpiCard(
                      label: 'Meals donated',
                      value: fmtNum(res.mealsDonated),
                      hint: 'all time, collected',
                      icon: Icons.volunteer_activism_outlined,
                    ),
                    const SizedBox(height: 16),
                    if (res.items.isEmpty)
                      const EmptyState(title: 'No donations yet', hint: 'Surplus pickups are scheduled on the web app.')
                    else
                      for (final d in res.items) ...[
                        Card(
                          child: ListTile(
                            leading: const Icon(Icons.local_shipping_outlined),
                            title: Text(d.ngoName ?? 'Unassigned NGO'),
                            subtitle: Text(fmtDay(d.date)),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('${d.meals} meals', style: Theme.of(context).textTheme.titleSmall),
                                Text(d.status, style: Theme.of(context).textTheme.bodySmall),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                  ],
                ),
              ),
            ),
    );
  }
}
