import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  static const _links = [
    (path: '/alerts', title: 'Alerts', hint: 'Stock, waste and forecast warnings', icon: Icons.notifications_outlined),
    (path: '/forecasts', title: 'Forecasts', hint: 'Next 7 days by dish', icon: Icons.trending_up),
    (path: '/donations', title: 'Donations', hint: 'Surplus meals sent to NGOs', icon: Icons.volunteer_activism_outlined),
    (path: '/assistant', title: 'AI Assistant', hint: 'Ask about waste, prep and sales', icon: Icons.chat_bubble_outline),
  ];

  Future<void> _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok == true && context.mounted) await context.read<AuthProvider>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = context.watch<AuthProvider>().user;
    final outlets = context.watch<OutletProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(child: Text((user?.name.isNotEmpty ?? false) ? user!.name[0] : '?')),
              title: Text(user?.name ?? ''),
              subtitle: Text('${user?.email ?? ''}\n${user?.roleName ?? ''}'
                  '${user?.organizationName != null ? ' · ${user!.organizationName}' : ''}'),
              isThreeLine: true,
            ),
          ),
          const SizedBox(height: 16),
          Text('OUTLET', style: theme.textTheme.labelSmall),
          const SizedBox(height: 8),
          if (outlets.outlets.isEmpty)
            const Text('No outlets on this account.')
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final o in outlets.outlets)
                  ChoiceChip(
                    label: Text(o.name),
                    selected: o.id == outlets.outletId,
                    onSelected: (_) => outlets.select(o.id),
                  ),
              ],
            ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                for (final (i, l) in _links.indexed) ...[
                  if (i > 0) const Divider(height: 1),
                  ListTile(
                    leading: Icon(l.icon),
                    title: Text(l.title),
                    subtitle: Text(l.hint),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(l.path),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => _confirmLogout(context),
            icon: Icon(Icons.logout, color: theme.colorScheme.error),
            label: Text('Sign out', style: TextStyle(color: theme.colorScheme.error)),
          ),
          const SizedBox(height: 16),
          Text('Server: ${context.read<AuthProvider>().api.baseUrl}', textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}
