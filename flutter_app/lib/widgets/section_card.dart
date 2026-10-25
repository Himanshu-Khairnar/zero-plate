import 'package:flutter/material.dart';

/// Card with a title, an optional description and a body.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, this.description, required this.child, this.trailing});

  final String title;
  final String? description;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: theme.textTheme.titleMedium)),
                ?trailing,
              ],
            ),
            if (description != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(description!,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }
}

/// Small outlined label (status / risk / stock badges) in the theme palette.
class Tag extends StatelessWidget {
  const Tag(this.label, {super.key, this.strong = false, this.danger = false});

  final String label;

  /// Filled with the primary colour.
  final bool strong;

  /// Uses the error colour (OUT / expired / locked).
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fg = danger ? scheme.error : (strong ? scheme.onPrimary : scheme.primary);
    final bg = danger ? scheme.error.withValues(alpha: 0.1) : (strong ? scheme.primary : scheme.primaryContainer);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: danger ? scheme.error.withValues(alpha: 0.4) : scheme.outline),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w600)),
    );
  }
}
