import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/confirm_dialog.dart';
import '../widgets/count_stepper.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

/// Kitchen mode: per-shift prepared/sold counters for today.
class KitchenScreen extends StatelessWidget {
  const KitchenScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Kitchen')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<KitchenResponse>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().kitchen(outletId),
              builder: (context, data, refresh) =>
                  _KitchenBody(outletId: outletId, data: data, refresh: refresh),
            ),
    );
  }
}

class _KitchenBody extends StatefulWidget {
  const _KitchenBody({required this.outletId, required this.data, required this.refresh});

  final String outletId;
  final KitchenResponse data;
  final Future<void> Function() refresh;

  @override
  State<_KitchenBody> createState() => _KitchenBodyState();
}

class _KitchenBodyState extends State<_KitchenBody> {
  Shift _shift = DateTime.now().hour < 16 ? Shift.lunch : Shift.dinner;

  /// Unsaved edits for the current shift, by dishId.
  final Map<String, ShiftCounts> _edits = {};
  bool _saving = false;

  @override
  void didUpdateWidget(covariant _KitchenBody old) {
    super.didUpdateWidget(old);
    // New data from the server (refresh / outlet change): drop stale edits.
    if (!identical(old.data, widget.data)) _edits.clear();
  }

  ShiftCounts _valueFor(KitchenDish d) => _edits[d.dishId] ?? d.countsFor(_shift);

  void _change(KitchenDish d, ShiftCounts next) {
    setState(() {
      if (next == d.countsFor(_shift)) {
        _edits.remove(d.dishId);
      } else {
        _edits[d.dishId] = next;
      }
    });
  }

  void _switchShift(Shift s) {
    if (s == _shift) return;
    if (_edits.isNotEmpty) showInfoSnackBar(context, 'Unsaved changes discarded');
    setState(() {
      _edits.clear();
      _shift = s;
    });
  }

  Future<void> _save() async {
    final api = context.read<ApiClient>();
    setState(() => _saving = true);
    try {
      for (final e in _edits.entries.toList()) {
        await api.logKitchen(
          outletId: widget.outletId,
          dishId: e.key,
          shift: _shift,
          prepared: e.value.prepared,
          sold: e.value.sold,
        );
        _edits.remove(e.key);
      }
      if (!mounted) return;
      showInfoSnackBar(context, 'Saved ${_shift.label.toLowerCase()} counts');
      await widget.refresh();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  bool _busy = false;

  Future<void> _logLeftovers() async {
    final data = widget.data;
    final left = data.dishes.fold<int>(0, (s, d) => s + d.leftover);
    final ok = await confirmAction(
      context,
      title: 'Log leftovers as waste?',
      message: 'Prepared − sold for ${fmtDay(data.date)} ($left plates) is logged as overproduction waste. '
          'Dishes already logged are skipped.',
      confirmLabel: 'Log leftovers',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final n = await context.read<ApiClient>().logLeftovers(widget.outletId, data.date);
      if (!mounted) return;
      showInfoSnackBar(context, n == 0 ? 'No new leftovers to log' : 'Logged leftovers for $n dish${n == 1 ? '' : 'es'}');
      await widget.refresh();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _lockDay() async {
    final data = widget.data;
    final prepared = data.dishes.fold<int>(0, (s, d) => s + d.prepared);
    final sold = data.dishes.fold<int>(0, (s, d) => s + d.sold);
    final left = data.dishes.fold<int>(0, (s, d) => s + d.leftover);
    final ok = await confirmAction(
      context,
      title: 'Close & lock ${fmtDay(data.date)}?',
      message: 'Prepared $prepared · sold $sold · leftover $left.' '\n\n'
          'Verify both shifts first. After locking, counts and the prep plan can no longer be changed.',
      confirmLabel: 'Lock day',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<ApiClient>().lockDay(widget.outletId, data.date);
      if (!mounted) return;
      _edits.clear();
      showInfoSnackBar(context, 'Day closed and locked');
      await widget.refresh();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = widget.data;
    final locked = data.locked;
    final dirty = _edits.length;
    final canManage = context.watch<AuthProvider>().user?.canManage ?? false;

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: widget.refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    Expanded(child: Text(fmtDay(data.date), style: theme.textTheme.titleMedium)),
                    if (locked)
                      Chip(
                        avatar: Icon(Icons.lock, size: 16, color: theme.colorScheme.error),
                        label: const Text('Locked'),
                      ),
                  ],
                ),
                if (locked)
                  Text('This day is locked. Counts are read-only.',
                      style: TextStyle(color: theme.colorScheme.error)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _busy || dirty > 0 ? null : _logLeftovers,
                      icon: const Icon(Icons.delete_sweep_outlined),
                      label: const Text('Log leftovers as waste'),
                    ),
                    if (canManage && !locked)
                      OutlinedButton.icon(
                        onPressed: _busy || dirty > 0 ? null : _lockDay,
                        icon: const Icon(Icons.lock_outline),
                        label: const Text('Close & lock day'),
                      ),
                  ],
                ),
                if (_busy) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
                const SizedBox(height: 12),
                SegmentedButton<Shift>(
                  segments: const [
                    ButtonSegment(value: Shift.lunch, label: Text('Lunch'), icon: Icon(Icons.wb_sunny_outlined)),
                    ButtonSegment(value: Shift.dinner, label: Text('Dinner'), icon: Icon(Icons.nights_stay_outlined)),
                  ],
                  selected: {_shift},
                  onSelectionChanged: locked ? null : (s) => _switchShift(s.first),
                ),
                const SizedBox(height: 8),
                Text("Steppers set this shift's counts; day totals (both shifts) are shown under each dish.",
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 12),
                if (data.dishes.isEmpty)
                  const EmptyState(title: 'No dishes', hint: 'Add dishes to the menu in the web app.'),
                for (final d in data.dishes) ...[
                  _DishCard(
                    dish: d,
                    value: _valueFor(d),
                    changed: _edits.containsKey(d.dishId),
                    enabled: !locked && !_saving,
                    onChanged: (v) => _change(d, v),
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Row(
              children: [
                if (dirty > 0)
                  TextButton(
                    onPressed: _saving ? null : () => setState(_edits.clear),
                    child: const Text('Discard'),
                  ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: locked || dirty == 0 || _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(dirty == 0
                            ? 'No changes'
                            : 'Save $dirty dish${dirty > 1 ? 'es' : ''} · ${_shift.label.toLowerCase()}'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _DishCard extends StatelessWidget {
  const _DishCard({
    required this.dish,
    required this.value,
    required this.changed,
    required this.enabled,
    required this.onChanged,
  });

  final KitchenDish dish;
  final ShiftCounts value;
  final bool changed;
  final bool enabled;
  final ValueChanged<ShiftCounts> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Card(
      shape: changed
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(6),
              side: BorderSide(color: theme.colorScheme.primary, width: 2),
            )
          : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(dish.dishName, style: theme.textTheme.titleMedium)),
                Text('target ${dish.target}', style: theme.textTheme.bodySmall?.copyWith(color: muted)),
              ],
            ),
            Text(
              'Day: prepared ${dish.prepared} · sold ${dish.sold} · left ${dish.leftover}',
              style: theme.textTheme.bodySmall?.copyWith(color: muted),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 24,
              runSpacing: 8,
              children: [
                CountStepper(
                  label: 'Prepared',
                  value: value.prepared,
                  enabled: enabled,
                  onChanged: (v) => onChanged(value.copyWith(prepared: v)),
                ),
                CountStepper(
                  label: 'Sold',
                  value: value.sold,
                  enabled: enabled,
                  onChanged: (v) => onChanged(value.copyWith(sold: v)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
