import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/empty_state.dart';

class _Message {
  final bool fromUser;
  final String text;
  const _Message(this.fromUser, this.text);
}

/// AI assistant chat. Each question is sent on its own (single-turn API);
/// the bubbles are just a local transcript.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_Message> _messages = [];
  bool _sending = false;

  static const _suggestions = [
    'How much did we waste this week?',
    'What should we prep tomorrow?',
    'Which dish is wasted most?',
  ];

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    final outletId = context.read<OutletProvider>().outletId;
    text = text.trim();
    if (text.isEmpty || outletId == null || _sending) return;
    _input.clear();
    setState(() {
      _messages.add(_Message(true, text));
      _sending = true;
    });
    _scrollToEnd();
    try {
      final reply = await context.read<ApiClient>().ask(outletId, text);
      if (!mounted) return;
      setState(() => _messages.add(_Message(false, reply)));
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToEnd();
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('AI Assistant')),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      const EmptyState(
                        icon: Icons.chat_bubble_outline,
                        title: 'Ask about waste, prep and sales',
                        hint: 'Each question is answered on its own.',
                      ),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in _suggestions) ActionChip(label: Text(s), onPressed: () => _send(s)),
                        ],
                      ),
                    ],
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length + (_sending ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i == _messages.length) {
                        return const _Bubble(fromUser: false, child: Text('Thinking…'));
                      }
                      final m = _messages[i];
                      return _Bubble(
                        fromUser: m.fromUser,
                        child: SelectableText(
                          m.text,
                          style: TextStyle(color: m.fromUser ? theme.colorScheme.onPrimary : null),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      textInputAction: TextInputAction.send,
                      onSubmitted: _send,
                      decoration: const InputDecoration(hintText: 'Ask a question…', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Send',
                    onPressed: _sending ? null : () => _send(_input.text),
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.fromUser, required this.child});

  final bool fromUser;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Align(
      alignment: fromUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        decoration: BoxDecoration(
          color: fromUser ? scheme.primary : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(12),
            topRight: const Radius.circular(12),
            bottomLeft: Radius.circular(fromUser ? 12 : 2),
            bottomRight: Radius.circular(fromUser ? 2 : 12),
          ),
        ),
        child: child,
      ),
    );
  }
}
