import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';
import '../widgets/section_card.dart';

/// Invite a manager or kitchen staff member (OWNER/MANAGER). The server
/// returns a 48-hour invitation link to share.
class InviteScreen extends StatefulWidget {
  const InviteScreen({super.key});

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  String _role = 'KITCHEN_STAFF';
  Set<String>? _outletIds;
  bool _sending = false;
  String? _inviteUrl;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;
    final outlets = _outletIds ?? {};
    if (outlets.isEmpty) {
      showErrorSnackBar(context, 'Pick at least one outlet.');
      return;
    }
    setState(() => _sending = true);
    try {
      final url = await context.read<ApiClient>().inviteStaff(
            email: _email.text.trim(),
            role: _role,
            outletIds: outlets.toList(),
          );
      if (!mounted) return;
      setState(() => _inviteUrl = url);
      showInfoSnackBar(context, 'Invitation created');
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final outlets = context.watch<OutletProvider>();
    _outletIds ??= {if (outlets.outletId != null) outlets.outletId!};
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Invite staff')),
      body: !(user?.canManage ?? false)
          ? const EmptyState(icon: Icons.lock_outline, title: 'Only owners and managers can invite staff.')
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Send an invitation link valid for 48 hours.',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 16),
                  TextFormField(
                    key: const Key('invite-email'),
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    decoration: const InputDecoration(labelText: 'Email', hintText: 'staff@example.com'),
                    validator: (v) {
                      final s = (v ?? '').trim();
                      return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s) ? null : 'Enter a valid email';
                    },
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _role,
                    decoration: const InputDecoration(labelText: 'Role'),
                    items: const [
                      DropdownMenuItem(value: 'KITCHEN_STAFF', child: Text('Kitchen Staff')),
                      DropdownMenuItem(value: 'MANAGER', child: Text('Manager')),
                    ],
                    onChanged: (v) => setState(() => _role = v ?? 'KITCHEN_STAFF'),
                  ),
                  const SizedBox(height: 16),
                  Text('Outlets', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final o in outlets.outlets)
                        FilterChip(
                          label: Text(o.name),
                          selected: _outletIds!.contains(o.id),
                          onSelected: (v) => setState(() => v ? _outletIds!.add(o.id) : _outletIds!.remove(o.id)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.person_add_alt),
                    label: Text(_sending ? 'Sending…' : 'Send invitation'),
                  ),
                  if (_inviteUrl != null) ...[
                    const SizedBox(height: 16),
                    SectionCard(
                      title: 'Invitation created',
                      description: 'Share this link with ${_email.text.trim()}. It expires in 48 hours.',
                      trailing: IconButton(
                        tooltip: 'Copy link',
                        icon: const Icon(Icons.copy),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: _inviteUrl!));
                          if (context.mounted) showInfoSnackBar(context, 'Link copied');
                        },
                      ),
                      child: SelectableText(_inviteUrl!, key: const Key('invite-url')),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
