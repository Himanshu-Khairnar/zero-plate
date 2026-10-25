import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

/// Tomorrow's prep plan (read-only, plus Approve for owners/managers).
class PrepScreen extends StatelessWidget {
  const PrepScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text("Tomorrow's prep")),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<PrepPlanResponse>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().prepPlan(outletId),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: _PlanBody(plan: res.plan, onChanged: refresh),
              ),
            ),
    );
  }
}

class _PlanBody extends StatefulWidget {
  const _PlanBody({required this.plan, required this.onChanged});

  final PrepPlan? plan;
  final Future<void> Function() onChanged;

  @override
  State<_PlanBody> createState() => _PlanBodyState();
}

class _PlanBodyState extends State<_PlanBody> {
  bool _approving = false;

  Future<void> _approve(PrepPlan plan) async {
    setState(() => _approving = true);
    try {
      await context.read<ApiClient>().approvePrepPlan(plan.id);
      if (!mounted) return;
      showInfoSnackBar(context, 'Prep plan approved');
      await widget.onChanged();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _approving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final plan = widget.plan;
    if (plan == null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          EmptyState(
            icon: Icons.assignment_outlined,
            title: 'No plan for tomorrow yet',
            hint: 'Prep plans are drafted on the web app. Pull to refresh once one is ready.',
          ),
        ],
      );
    }

    final theme = Theme.of(context);
    final canApprove = context.watch<AuthProvider>().user?.canApprove ?? false;
    final totalPlanned = plan.items.fold<int>(0, (s, i) => s + i.plannedQty);
    final totalForecast = plan.items.fold<int>(0, (s, i) => s + i.forecastQty);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: Text(fmtDay(plan.date), style: theme.textTheme.titleMedium)),
            Chip(
              avatar: Icon(plan.isApproved ? Icons.check_circle : Icons.edit_note, size: 18),
              label: Text(plan.isApproved ? 'APPROVED' : plan.status),
            ),
          ],
        ),
        if (plan.status == 'LOCKED')
          Text('Locked: the day has started, counts are final.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 8),
        Text('Planned $totalPlanned plates · forecast $totalForecast',
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 12),
        if (plan.items.isEmpty)
          const EmptyState(title: 'Plan has no dishes')
        else
          Card(
            child: Column(
              children: [
                for (final (i, item) in plan.items.indexed) ...[
                  if (i > 0) const Divider(height: 1),
                  ListTile(
                    title: Text(item.dishName),
                    subtitle: Text('Forecast ${item.forecastQty} ${item.unit}'),
                    trailing: Text(
                      '${item.plannedQty}',
                      style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 16),
        if (plan.isDraft && canApprove)
          FilledButton.icon(
            onPressed: _approving ? null : () => _approve(plan),
            icon: _approving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.check),
            label: const Text('Approve plan'),
          )
        else if (plan.isDraft)
          Text('Waiting for an owner or manager to approve.',
              textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
      ],
    );
  }
}
