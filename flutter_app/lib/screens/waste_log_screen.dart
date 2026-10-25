import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

enum _Kind { dish, ingredient }

/// Form to log a waste entry. Options come from GET waste/options.
/// Pops with `true` when an entry was saved. [prefill] (e.g. from a photo
/// suggestion) preselects the dish and fills quantity and note.
class WasteLogScreen extends StatelessWidget {
  const WasteLogScreen({super.key, this.prefill});

  final WastePrefill? prefill;

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('Log waste')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<WasteOptions>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().wasteOptions(outletId),
              builder: (context, opts, _) => _WasteForm(outletId: outletId, options: opts, prefill: prefill),
            ),
    );
  }
}

class _WasteForm extends StatefulWidget {
  const _WasteForm({required this.outletId, required this.options, this.prefill});

  final String outletId;
  final WasteOptions options;
  final WastePrefill? prefill;

  @override
  State<_WasteForm> createState() => _WasteFormState();
}

class _WasteFormState extends State<_WasteForm> {
  final _formKey = GlobalKey<FormState>();
  final _qty = TextEditingController();
  final _note = TextEditingController();
  _Kind _kind = _Kind.dish;
  String? _itemId;
  String? _reason;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.options.dishes.isEmpty && widget.options.ingredients.isNotEmpty) _kind = _Kind.ingredient;
    if (widget.options.reasons.isNotEmpty) _reason = widget.options.reasons.first;
    final p = widget.prefill;
    if (p != null) {
      if (p.dishId != null && widget.options.dishes.any((d) => d.id == p.dishId)) {
        _kind = _Kind.dish;
        _itemId = p.dishId;
      }
      if (p.qty != null) _qty.text = fmtQty(p.qty!);
      if (p.note != null) _note.text = p.note!;
      if (widget.options.reasons.contains('overproduction')) _reason = 'overproduction';
    }
  }

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    super.dispose();
  }

  List<NamedOption> get _items =>
      _kind == _Kind.dish ? widget.options.dishes : widget.options.ingredients;

  String get _unit {
    if (_kind == _Kind.dish) return 'plates';
    final match = widget.options.ingredients.where((i) => i.id == _itemId);
    return match.isEmpty ? '' : (match.first.unit ?? '');
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await context.read<ApiClient>().logWaste(
            outletId: widget.outletId,
            dishId: _kind == _Kind.dish ? _itemId : null,
            ingredientId: _kind == _Kind.ingredient ? _itemId : null,
            qty: double.parse(_qty.text.trim()),
            unit: _unit,
            reason: _reason!,
            note: _note.text.trim(),
          );
      if (!mounted) return;
      showInfoSnackBar(context, 'Waste logged');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SegmentedButton<_Kind>(
            segments: const [
              ButtonSegment(value: _Kind.dish, label: Text('Dish'), icon: Icon(Icons.restaurant)),
              ButtonSegment(value: _Kind.ingredient, label: Text('Ingredient'), icon: Icon(Icons.egg_outlined)),
            ],
            selected: {_kind},
            onSelectionChanged: (s) => setState(() {
              _kind = s.first;
              _itemId = null;
            }),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            key: ValueKey(_kind),
            initialValue: _itemId,
            isExpanded: true,
            decoration: InputDecoration(labelText: _kind == _Kind.dish ? 'Dish' : 'Ingredient'),
            items: [
              for (final o in _items)
                DropdownMenuItem(
                  value: o.id,
                  child: Text(o.unit == null ? o.name : '${o.name} (${o.unit})'),
                ),
            ],
            onChanged: (v) => setState(() => _itemId = v),
            validator: (v) => v == null ? 'Pick one' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _qty,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'Quantity', suffixText: _unit),
            validator: (v) {
              final n = double.tryParse((v ?? '').trim());
              return (n == null || n <= 0) ? 'Enter a quantity above 0' : null;
            },
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _reason,
            decoration: const InputDecoration(labelText: 'Reason'),
            items: [
              for (final r in widget.options.reasons) DropdownMenuItem(value: r, child: Text(reasonLabel(r))),
            ],
            onChanged: (v) => setState(() => _reason = v),
            validator: (v) => v == null ? 'Pick a reason' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _note,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Note (optional)'),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _saving ? null : _submit,
            icon: _saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_outlined),
            label: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
