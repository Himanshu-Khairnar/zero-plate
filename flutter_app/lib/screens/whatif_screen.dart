import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';
import '../widgets/section_card.dart';

/// What-if simulator: override rain, temperature, holiday or a discount for a
/// day and compare baseline vs scenario demand, prep and waste.
class WhatIfScreen extends StatelessWidget {
  const WhatIfScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    return Scaffold(
      appBar: AppBar(title: const Text('What-if')),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<WasteOptions>(
              reloadKey: outletId,
              load: () => context.read<ApiClient>().wasteOptions(outletId),
              builder: (context, opts, _) => _WhatIfBody(key: ValueKey(outletId), outletId: outletId, dishes: opts.dishes),
            ),
    );
  }
}

class _WhatIfBody extends StatefulWidget {
  const _WhatIfBody({super.key, required this.outletId, required this.dishes});

  final String outletId;
  final List<NamedOption> dishes;

  @override
  State<_WhatIfBody> createState() => _WhatIfBodyState();
}

class _WhatIfBodyState extends State<_WhatIfBody> {
  String _date = tomorrowIso();
  bool _rainOn = false;
  double _rainMm = 25;
  bool _tempOn = false;
  double _tempMax = 36;
  bool _holiday = false;
  bool _discountOn = false;
  double _discountPct = 15;
  late Set<String> _dishIds = {for (final d in widget.dishes) d.id};

  WhatIfResult? _result;
  String _resultSummary = '';
  bool _running = false;

  String get _summary => [
        if (_rainOn) '${_rainMm.round()} mm rain',
        if (_tempOn) '${_tempMax.round()}°C',
        if (_holiday) 'holiday',
        if (_discountOn) '${_discountPct.round()}% off',
      ].join(', ').ifEmpty('no changes');

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_date),
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 13)),
    );
    if (d != null) setState(() => _date = isoDate(d));
  }

  Future<void> _run() async {
    setState(() => _running = true);
    try {
      final scenario = WhatIfScenario(
        rainMm: _rainOn ? _rainMm : null,
        tempMax: _tempOn ? _tempMax : null,
        isHoliday: _holiday,
        discountPct: _discountOn ? _discountPct : null,
        dishIds: _dishIds.length == widget.dishes.length ? null : _dishIds.toList(),
      );
      final res = await context.read<ApiClient>().whatIf(widget.outletId, _date, scenario);
      if (!mounted) return;
      setState(() {
        _result = res;
        _resultSummary = _summary;
      });
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  Widget _slider({
    required String label,
    required IconData icon,
    required bool on,
    required ValueChanged<bool> onToggle,
    required double value,
    required double min,
    required double max,
    required int divisions,
    required String display,
    required ValueChanged<double> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          secondary: Icon(icon),
          title: Text(label),
          subtitle: Text(on ? display : 'model default'),
          value: on,
          onChanged: onToggle,
        ),
        Slider(
          value: value,
          min: min,
          max: max,
          divisions: divisions,
          label: display,
          onChanged: on ? onChanged : null,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final allSelected = _dishIds.length == widget.dishes.length;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionCard(
          title: 'Conditions',
          description: 'Switch a condition on to override what the model assumes for that day.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Day', suffixIcon: Icon(Icons.calendar_today_outlined)),
                  child: Text(fmtDay(_date)),
                ),
              ),
              _slider(
                label: 'Rain',
                icon: Icons.water_drop_outlined,
                on: _rainOn,
                onToggle: (v) => setState(() => _rainOn = v),
                value: _rainMm,
                min: 0,
                max: 120,
                divisions: 24,
                display: '${_rainMm.round()} mm',
                onChanged: (v) => setState(() => _rainMm = v),
              ),
              _slider(
                label: 'Max temperature',
                icon: Icons.wb_sunny_outlined,
                on: _tempOn,
                onToggle: (v) => setState(() => _tempOn = v),
                value: _tempMax,
                min: 22,
                max: 44,
                divisions: 22,
                display: '${_tempMax.round()}°C',
                onChanged: (v) => setState(() => _tempMax = v),
              ),
              _slider(
                label: 'Discount on selected dishes',
                icon: Icons.sell_outlined,
                on: _discountOn,
                onToggle: (v) => setState(() => _discountOn = v),
                value: _discountPct,
                min: 5,
                max: 50,
                divisions: 9,
                display: '${_discountPct.round()}% off',
                onChanged: (v) => setState(() => _discountPct = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                secondary: const Icon(Icons.celebration_outlined),
                title: const Text('Treat as a public holiday'),
                value: _holiday,
                onChanged: (v) => setState(() => _holiday = v),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: Text('Dishes', style: theme.textTheme.titleSmall)),
                  TextButton(
                    onPressed: () => setState(() => _dishIds = allSelected ? {} : {for (final d in widget.dishes) d.id}),
                    child: Text(allSelected ? 'Clear' : 'Select all'),
                  ),
                ],
              ),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final d in widget.dishes)
                    FilterChip(
                      label: Text(d.name),
                      selected: _dishIds.contains(d.id),
                      onSelected: (v) => setState(() => v ? _dishIds.add(d.id) : _dishIds.remove(d.id)),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _running || _dishIds.isEmpty ? null : _run,
                icon: _running
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.play_arrow),
                label: const Text('Run scenario'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (_result != null) WhatIfResultView(result: _result!, summary: _resultSummary),
      ],
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

/// Baseline vs scenario: totals and a per-dish table side by side.
class WhatIfResultView extends StatelessWidget {
  const WhatIfResultView({super.key, required this.result, required this.summary});

  final WhatIfResult result;
  final String summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final a = result.assumed;
    final t0 = result.baseline.totals;
    final t1 = result.scenario.totals;
    final assumed = [
      a.rainMm != null ? '${fmtQty(a.rainMm!)} mm rain' : 'unknown rain',
      a.tempMax != null ? '${fmtQty(a.tempMax!)}°C' : 'unknown temperature',
      if (a.isHoliday) a.holidayName ?? 'public holiday',
      if (a.isWeekend) 'weekend',
    ].join(', ');

    TableRow row(List<String> cells, {bool header = false}) => TableRow(
          decoration: header ? BoxDecoration(color: theme.colorScheme.surfaceContainerHigh) : null,
          children: [
            for (final (i, c) in cells.indexed)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                child: Text(c,
                    textAlign: i == 0 ? TextAlign.left : TextAlign.right,
                    style: header ? theme.textTheme.labelSmall : theme.textTheme.bodySmall),
              ),
          ],
        );

    String money(double v) => fmtRupees(v);
    String n(double v) => fmtNum(v);

    final totals = [
      ('Expected demand', n(t0.likely), n(t1.likely)),
      ('Plates to prep', n(t0.prepQty), n(t1.prepQty)),
      ('Prep cost', money(t0.prepCost), money(t1.prepCost)),
      ('Expected waste', money(t0.wasteCost), money(t1.wasteCost)),
      ('Waste plates', n(t0.wastePlates), n(t1.wastePlates)),
      ('Expected revenue', money(t0.expectedRevenue), money(t1.expectedRevenue)),
      ('Lost sales', money(t0.lostSales), money(t1.lostSales)),
    ];

    final baseById = {for (final r in result.baseline.rows) r.dishId: r};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionCard(
          title: '${fmtDay(result.date)} · $summary',
          description: 'Model assumes $assumed. Model ${result.modelVersion}.',
          child: Table(
            columnWidths: const {0: FlexColumnWidth(1.6)},
            children: [
              row(['', 'Baseline', 'Scenario'], header: true),
              for (final t in totals) row([t.$1, t.$2, t.$3]),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Per dish',
          description: 'Baseline → scenario. Prep uses the same risk-aware rule as the daily plan.',
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columnSpacing: 16,
              horizontalMargin: 4,
              headingTextStyle: theme.textTheme.labelSmall,
              dataTextStyle: theme.textTheme.bodySmall,
              columns: const [
                DataColumn(label: Text('Dish')),
                DataColumn(label: Text('Likely'), numeric: true),
                DataColumn(label: Text('Prep'), numeric: true),
                DataColumn(label: Text('Prep cost'), numeric: true),
                DataColumn(label: Text('Waste cost'), numeric: true),
              ],
              rows: [
                for (final s in result.scenario.rows)
                  () {
                    final b = baseById[s.dishId];
                    String pair(double? x, double y, String Function(double) f) => b == null ? f(y) : '${f(x!)} → ${f(y)}';
                    return DataRow(cells: [
                      DataCell(Tooltip(message: s.explanation, child: Text(s.dishName))),
                      DataCell(Text(pair(b?.likely, s.likely, n))),
                      DataCell(Text(pair(b?.prepQty, s.prepQty, n))),
                      DataCell(Text(pair(b?.prepCost, s.prepCost, money))),
                      DataCell(Text(pair(b?.wasteCost, s.wasteCost, money))),
                    ]);
                  }(),
              ],
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text('Long-press a dish name for the model\'s explanation.',
            style: theme.textTheme.bodySmall?.copyWith(color: muted)),
      ],
    );
  }
}
