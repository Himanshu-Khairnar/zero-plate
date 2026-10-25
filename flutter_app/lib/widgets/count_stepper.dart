import 'package:flutter/material.dart';

/// A labelled "- value +" counter. Named CountStepper to avoid clashing with
/// Material's multi-step [Stepper] widget.
class CountStepper extends StatelessWidget {
  const CountStepper({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.step = 1,
  });

  final String label;
  final int value;
  final ValueChanged<int> onChanged;
  final bool enabled;
  final int step;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton.outlined(
              tooltip: 'Decrease $label',
              onPressed: enabled && value > 0 ? () => onChanged((value - step).clamp(0, 1 << 30)) : null,
              icon: const Icon(Icons.remove),
            ),
            SizedBox(
              width: 48,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            IconButton.outlined(
              tooltip: 'Increase $label',
              onPressed: enabled ? () => onChanged(value + step) : null,
              icon: const Icon(Icons.add),
            ),
          ],
        ),
      ],
    );
  }
}
