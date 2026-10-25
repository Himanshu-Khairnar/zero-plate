import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/kpi_card.dart';
import '../widgets/section_card.dart';

/// Prep plan for a day (default tomorrow): forecast band, suggested vs planned
/// per dish, ingredient roll-up and adjustment log. OWNER/MANAGER can generate
/// a draft, adjust quantities (with a reason) and approve.
class PrepScreen extends StatefulWidget {
  const PrepScreen({super.key});

  @override
  State<PrepScreen> createState() => _PrepScreenState();
}

class _PrepScreenState extends State<PrepScreen> {
  String _date = tomorrowIso();

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_date),
      firstDate: now.subtract(const Duration(days: 60)),
      lastDate: now.add(const Duration(days: 14)),
    );
    if (picked != null && mounted) setState(() => _date = isoDate(picked));
  }

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    final isTomorrow = _date == tomorrowIso();
    return Scaffold(
      appBar: AppBar(
        title: Text(isTomorrow ? "Tomorrow's prep" : 'Prep plan'),
        actions: [
          TextButton.icon(
            key: const Key('prep-date'),
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text(fmtDay(_date)),
          ),
        ],
      ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<PlanView?>(
              reloadKey: (outletId, _date),
              load: () => context.read<ApiClient>().prepPlanFull(outletId, date: _date),
              builder: (context, plan, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: _PlanBody(outletId: outletId, date: _date, plan: plan, refresh: refresh),
              ),
            ),
    );
  }
}

class _PlanBody extends StatefulWidget {
  const _PlanBody({required this.outletId, required this.date, required this.plan, required this.refresh});

  final String outletId;
  final String date;
  final PlanView? plan;
  final Future<void> Function() refresh;

  @override
  State<_PlanBody> createState() => _PlanBodyState();
}

class _PlanBodyState extends State<_PlanBody> {
  /// Latest plan returned by generate/adjust (until the next reload).
  PlanView? _override;
  bool _busy = false;

  PlanView? get _plan => _override ?? widget.plan;

  @override
  void didUpdateWidget(covariant _PlanBody old) {
    super.didUpdateWidget(old);
    if (!identical(old.plan, widget.plan)) _override = null;
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _generate() => _run(() async {
    final plan = await context.read<ApiClient>().generatePrepPlan(widget.outletId, widget.date);
    if (!mounted) return;
    setState(() => _override = plan);
    showInfoSnackBar(context, 'Draft plan ready');
  });

  Future<void> _edit(PlanView plan, PlanItemView item) async {
    final res = await showDialog<({int qty, String reason})>(
      context: context,
      builder: (_) => _AdjustDialog(item: item),
    );
    if (res == null || res.qty == item.plannedQty || !mounted) return;
    await _run(() async {
      final next = await context.read<ApiClient>().adjustPrepPlan(plan.id, [
        (dishId: item.dishId, plannedQty: res.qty, reason: res.reason),
      ]);
      if (!mounted) return;
      setState(() => _override = next);
      showInfoSnackBar(context, '${item.dishName}: ${item.plannedQty} → ${res.qty}');
    });
  }

  Future<void> _approve(PlanView plan) async {
    final notes = await showDialog<String>(
      context: context,
      builder: (_) => _ApproveDialog(reapprove: plan.isApproved),
    );
    if (notes == null || !mounted) return;
    await _run(() async {
      await context.read<ApiClient>().approvePrepPlanWithNotes(plan.id, notes: notes.trim());
      if (!mounted) return;
      showInfoSnackBar(context, 'Prep plan approved');
      await widget.refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final canManage = context.watch<AuthProvider>().user?.canManage ?? false;
    final plan = _plan;
    if (plan == null) return _noPlan(canManage);

    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final editable = canManage && !plan.isLocked && !_busy;
    final suggestedTotal = plan.items.fold<int>(0, (s, i) => s + i.suggestedQty);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: Text(fmtDay(plan.date), style: theme.textTheme.titleMedium)),
            Tag(plan.status, strong: plan.isApproved, danger: plan.isLocked),
          ],
        ),
        if (plan.approvedBy != null)
          Text(
            'Approved by ${plan.approvedBy}${plan.approvedAt != null ? ' · ${fmtDateTime(plan.approvedAt!)}' : ''}',
            style: theme.textTheme.bodySmall?.copyWith(color: muted),
          ),
        if (plan.notes != null && plan.notes!.isNotEmpty)
          Text('Notes: ${plan.notes}', style: theme.textTheme.bodySmall?.copyWith(color: muted)),
        if (plan.isLocked)
          Text(
            'The day has been closed; the plan is locked.',
            style: theme.textTheme.bodySmall?.copyWith(color: muted),
          ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: KpiCard(
                label: 'Plates to prep',
                value: fmtNum(plan.totals.plates),
                hint: 'forecast ${fmtNum(plan.totals.forecastLikely)} sold',
                icon: Icons.restaurant,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: KpiCard(
                label: 'Ingredient cost',
                value: fmtRupees(plan.totals.prepCost),
                hint: 'current prices',
                icon: Icons.payments_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_busy) const LinearProgressIndicator(),
        SectionCard(
          title: 'Plates per dish',
          description:
              'Suggested = likely + risk weight × (high − likely).'
              '${editable ? ' Tap a dish to change its planned plates.' : ''}',
          trailing: canManage && plan.isDraft
              ? TextButton.icon(
                  onPressed: _busy ? null : _generate,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Re-forecast'),
                )
              : null,
          child: plan.items.isEmpty
              ? const EmptyState(title: 'Plan has no dishes')
              : Column(
                  children: [
                    for (final (i, item) in plan.items.indexed) ...[
                      if (i > 0) const Divider(height: 1),
                      _ItemTile(item: item, onTap: editable ? () => _edit(plan, item) : null),
                    ],
                    const Divider(height: 1),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          Expanded(child: Text('Total', style: theme.textTheme.titleSmall)),
                          Text(
                            'suggested $suggestedTotal · planned ${plan.totals.plates}',
                            style: theme.textTheme.titleSmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
        const SizedBox(height: 12),
        if (canManage && !plan.isLocked)
          FilledButton.icon(
            onPressed: _busy ? null : () => _approve(plan),
            icon: const Icon(Icons.check_circle_outline),
            label: Text(plan.isApproved ? 'Re-approve' : 'Approve plan'),
          )
        else if (plan.isDraft)
          Text(
            'Waiting for an owner or manager to approve.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Ingredients to prepare',
          description: 'From the recipes, for the planned plates.',
          child: plan.ingredients.isEmpty
              ? Text('No recipes linked to these dishes.', style: theme.textTheme.bodySmall?.copyWith(color: muted))
              : Column(
                  children: [
                    for (final n in plan.ingredients)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(n.name),
                        subtitle: n.dishNames.isEmpty ? null : Text(n.dishNames.join(', ')),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('${fmtQty(n.qty)} ${n.unit}', style: theme.textTheme.titleSmall),
                            Text(fmtRupees(n.cost), style: theme.textTheme.bodySmall?.copyWith(color: muted)),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Adjustment log',
          description: 'Every manual change, so overrides can be audited.',
          child: plan.adjustments.isEmpty
              ? Text('No adjustments yet.', style: theme.textTheme.bodySmall?.copyWith(color: muted))
              : Column(
                  children: [
                    for (final a in plan.adjustments)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(a.dishName),
                        subtitle: Text(
                          '${a.adjustedBy} · ${fmtDateTime(a.createdAt)}'
                          '${a.reason != null && a.reason!.isNotEmpty ? ' · ${a.reason}' : ''}',
                        ),
                        trailing: Text('${a.fromQty} → ${a.toQty}', style: theme.textTheme.titleSmall),
                      ),
                  ],
                ),
        ),
        if (plan.modelVersion != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Model ${plan.modelVersion}',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: muted),
            ),
          ),
      ],
    );
  }

  Widget _noPlan(bool canManage) {
    final isTomorrow = widget.date == tomorrowIso();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        EmptyState(
          icon: Icons.assignment_outlined,
          title: isTomorrow ? 'No plan for tomorrow yet' : 'No plan for ${fmtDay(widget.date)}',
          hint: canManage
              ? 'Generate a draft from the forecast, then adjust and approve it.'
              : 'An owner or manager drafts the plan. Pull to refresh once one is ready.',
        ),
        if (canManage)
          FilledButton.icon(
            onPressed: _busy ? null : _generate,
            icon: _busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.auto_awesome_outlined),
            label: const Text('Generate draft'),
          ),
      ],
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, this.onTap});

  final PlanItemView item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final changed = item.plannedQty != item.suggestedQty;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(child: Text(item.dishName, style: theme.textTheme.titleSmall)),
                      const SizedBox(width: 6),
                      Tag(item.riskLabel),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Low ${item.forecastLow.round()} · Likely ${item.forecastLikely.round()} · High ${item.forecastHigh.round()}',
                    style: theme.textTheme.bodySmall,
                  ),
                  Text(
                    'Suggested ${item.suggestedQty} · ${fmtRupees(item.plannedQty * item.costPerPlate)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: muted),
                  ),
                  if (item.explanation != null && item.explanation!.isNotEmpty)
                    Text(
                      item.explanation!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(color: muted, fontStyle: FontStyle.italic),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${item.plannedQty}',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: changed ? theme.colorScheme.primary : null,
                  ),
                ),
                Text('planned', style: theme.textTheme.labelSmall?.copyWith(color: muted)),
                if (onTap != null)
                  Icon(
                    Icons.edit_outlined,
                    key: ValueKey('edit-${item.dishId}'),
                    size: 16,
                    color: muted,
                    semanticLabel: 'Edit ${item.dishName}',
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AdjustDialog extends StatefulWidget {
  const _AdjustDialog({required this.item});

  final PlanItemView item;

  @override
  State<_AdjustDialog> createState() => _AdjustDialogState();
}

class _AdjustDialogState extends State<_AdjustDialog> {
  late final _qty = TextEditingController(text: '${widget.item.plannedQty}');
  final _reason = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _qty.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    return AlertDialog(
      title: Text(i.dishName),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Forecast ${i.forecastLow.round()}–${i.forecastHigh.round()} (likely ${i.forecastLikely.round()}), suggested ${i.suggestedQty}.',
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('adjust-qty'),
              controller: _qty,
              autofocus: true,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Planned plates'),
              validator: (v) => int.tryParse(v ?? '') == null ? 'Enter a whole number' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('adjust-reason'),
              controller: _reason,
              decoration: const InputDecoration(labelText: 'Reason (logged)', hintText: 'e.g. college event nearby'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (!_formKey.currentState!.validate()) return;
            Navigator.pop(context, (qty: int.parse(_qty.text), reason: _reason.text.trim()));
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _ApproveDialog extends StatefulWidget {
  const _ApproveDialog({required this.reapprove});

  final bool reapprove;

  @override
  State<_ApproveDialog> createState() => _ApproveDialogState();
}

class _ApproveDialogState extends State<_ApproveDialog> {
  final _notes = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.reapprove ? 'Re-approve plan?' : 'Approve plan?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Kitchen targets are set to the planned plates.'),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Notes (optional)'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, _notes.text), child: const Text('Approve')),
      ],
    );
  }
}
