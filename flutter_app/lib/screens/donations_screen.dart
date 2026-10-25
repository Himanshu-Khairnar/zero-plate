import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/kpi_card.dart';
import '../widgets/section_card.dart';

typedef _DonationsData = ({DonationsResponse donations, SurplusEstimate? surplus});

const donationStatuses = ['PLANNED', 'COLLECTED', 'CANCELLED'];

String statusLabel(String s) => s.isEmpty ? s : s[0] + s.substring(1).toLowerCase();

class DonationsScreen extends StatefulWidget {
  const DonationsScreen({super.key});

  @override
  State<DonationsScreen> createState() => _DonationsScreenState();
}

class _DonationsScreenState extends State<DonationsScreen> {
  int _version = 0;

  Future<_DonationsData> _load(String outletId) async {
    final api = context.read<ApiClient>();
    final results = await Future.wait<Object?>([
      api.donations(outletId),
      // The suggestion is a nice-to-have; the log still shows if it fails.
      api.suggestSurplus(outletId).then<SurplusEstimate?>((v) => v).catchError((_) => null),
    ]);
    return (donations: results[0] as DonationsResponse, surplus: results[1] as SurplusEstimate?);
  }

  Future<void> _newDonation(String outletId, {int? meals, String? dishNames}) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => DonationFormScreen(outletId: outletId, meals: meals, dishNames: dishNames),
    ));
    if (saved == true && mounted) setState(() => _version++);
  }

  Future<void> _setStatus(String outletId, Donation d, String status) async {
    try {
      await context.read<ApiClient>().setDonationStatus(outletId, d.id, status);
      if (!mounted) return;
      showInfoSnackBar(context, 'Marked ${statusLabel(status).toLowerCase()}');
      setState(() => _version++);
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Donations')),
      floatingActionButton: outletId == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _newDonation(outletId),
              icon: const Icon(Icons.add),
              label: const Text('New donation'),
            ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<_DonationsData>(
              reloadKey: (outletId, _version),
              load: () => _load(outletId),
              builder: (context, data, refresh) {
                final res = data.donations;
                final surplus = data.surplus;
                return RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                    children: [
                      KpiCard(
                        label: 'Meals donated',
                        value: fmtNum(res.mealsDonated),
                        hint: 'all time, collected',
                        icon: Icons.volunteer_activism_outlined,
                      ),
                      const SizedBox(height: 12),
                      if (surplus != null) ...[
                        SectionCard(
                          title: "Tonight's surplus",
                          description: surplus.total > 0
                              ? 'About ${surplus.total} plates likely left over (approved plan cushion + kitchen board).'
                              : 'No surplus expected from the plan or the kitchen board so far.',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final l in surplus.lines)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 2),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text(l.dishName)),
                                      Text('${l.plates} plates · ${l.source}', style: theme.textTheme.bodySmall),
                                    ],
                                  ),
                                ),
                              if (surplus.total > 0) ...[
                                const SizedBox(height: 8),
                                FilledButton.tonalIcon(
                                  onPressed: () => _newDonation(
                                    outletId,
                                    meals: surplus.total,
                                    dishNames: surplus.lines.map((l) => l.dishName).join(', '),
                                  ),
                                  icon: const Icon(Icons.volunteer_activism_outlined),
                                  label: Text('Donate ${surplus.total} meals'),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      Text('DONATION LOG', style: theme.textTheme.labelSmall),
                      const SizedBox(height: 8),
                      if (res.items.isEmpty)
                        const EmptyState(title: 'No donations yet', hint: 'Tap "New donation" to plan a pickup.')
                      else
                        for (final d in res.items) ...[
                          Card(
                            child: ListTile(
                              leading: const Icon(Icons.local_shipping_outlined),
                              title: Text(d.ngoName ?? 'Unassigned NGO'),
                              subtitle: Text('${fmtDay(d.date)} · ${d.meals} meals'),
                              trailing: PopupMenuButton<String>(
                                key: ValueKey('status-${d.id}'),
                                tooltip: 'Change status',
                                initialValue: d.status,
                                onSelected: (s) => s == d.status ? null : _setStatus(outletId, d, s),
                                itemBuilder: (_) => [
                                  for (final s in donationStatuses) PopupMenuItem(value: s, child: Text(statusLabel(s))),
                                ],
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Tag(statusLabel(d.status), strong: d.status == 'COLLECTED', danger: d.status == 'CANCELLED'),
                                    const Icon(Icons.arrow_drop_down),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                    ],
                  ),
                );
              },
            ),
    );
  }
}

/// Form for POST donations. Pops with `true` when saved.
class DonationFormScreen extends StatelessWidget {
  const DonationFormScreen({super.key, required this.outletId, this.meals, this.dishNames});

  final String outletId;
  final int? meals;
  final String? dishNames;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New donation')),
      body: AsyncView<List<Ngo>>(
        reloadKey: outletId,
        load: () => context.read<ApiClient>().ngos(outletId),
        builder: (context, ngos, _) => _DonationForm(outletId: outletId, ngos: ngos, meals: meals, dishNames: dishNames),
      ),
    );
  }
}

class _DonationForm extends StatefulWidget {
  const _DonationForm({required this.outletId, required this.ngos, this.meals, this.dishNames});

  final String outletId;
  final List<Ngo> ngos;
  final int? meals;
  final String? dishNames;

  @override
  State<_DonationForm> createState() => _DonationFormState();
}

class _DonationFormState extends State<_DonationForm> {
  final _formKey = GlobalKey<FormState>();
  late final _meals = TextEditingController(text: '${widget.meals ?? 10}');
  late final _dishes = TextEditingController(text: widget.dishNames ?? '');
  final _note = TextEditingController();
  String? _ngoId;
  String _date = todayIso();
  bool _saving = false;

  @override
  void dispose() {
    _meals.dispose();
    _dishes.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_date),
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 30)),
    );
    if (d != null) setState(() => _date = isoDate(d));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await context.read<ApiClient>().createDonation(
            outletId: widget.outletId,
            ngoId: _ngoId,
            date: _date,
            meals: int.parse(_meals.text),
            dishNames: _dishes.text.trim(),
            note: _note.text.trim(),
          );
      if (!mounted) return;
      showInfoSnackBar(context, 'Donation planned');
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
          DropdownButtonFormField<String?>(
            initialValue: _ngoId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'NGO'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Not assigned yet')),
              for (final n in widget.ngos)
                DropdownMenuItem<String?>(
                  value: n.id,
                  child: Text([n.name, if (n.city != null && n.city!.isNotEmpty) n.city!].join(' · '),
                      overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setState(() => _ngoId = v),
          ),
          const SizedBox(height: 16),
          InkWell(
            onTap: _pickDate,
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Day', suffixIcon: Icon(Icons.calendar_today_outlined)),
              child: Text(fmtDay(_date)),
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            key: const Key('donation-meals'),
            controller: _meals,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Meals'),
            validator: (v) => (int.tryParse(v ?? '') ?? 0) <= 0 ? 'Enter at least 1 meal' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _dishes,
            decoration: const InputDecoration(labelText: 'Dishes', hintText: 'e.g. Veg Thali, Dal Khichdi'),
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
