import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../state/auth_provider.dart';
import '../state/outlet_provider.dart';
import '../widgets/async_view.dart';
import '../widgets/confirm_dialog.dart';
import '../widgets/empty_state.dart';
import '../widgets/format.dart';

/// Recent waste entries for the outlet, a "Log waste" form, photo recognition
/// that prefills the form, and delete (OWNER/MANAGER).
class WasteScreen extends StatefulWidget {
  const WasteScreen({super.key, this.imagePicker});

  /// Injected in tests.
  final ImagePicker? imagePicker;

  @override
  State<WasteScreen> createState() => _WasteScreenState();
}

class _WasteScreenState extends State<WasteScreen> {
  /// Bumped after logging/deleting waste so the list reloads.
  int _version = 0;
  bool _recognizing = false;

  late final ImagePicker _picker = widget.imagePicker ?? ImagePicker();

  Future<void> _openLog([WastePrefill? prefill]) async {
    final saved = await context.push<bool>('/waste-log', extra: prefill);
    if (saved == true && mounted) setState(() => _version++);
  }

  Future<void> _photo(String outletId) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    XFile? file;
    try {
      // Downscaled JPEG keeps the upload well under the 5 MB limit.
      file = await _picker.pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
    } catch (e) {
      if (mounted) showErrorSnackBar(context, 'Could not open the ${source == ImageSource.camera ? 'camera' : 'gallery'}.');
      return;
    }
    if (file == null || !mounted) return;

    final api = context.read<ApiClient>();
    setState(() => _recognizing = true);
    try {
      final bytes = await file.readAsBytes();
      if (bytes.length > 5 * 1024 * 1024) throw const ApiException(413, 'Photo must be 5 MB or smaller.');
      final name = file.name.isEmpty ? 'photo.jpg' : file.name;
      final result = await api.recognizeWaste(outletId, bytes, name);
      if (!mounted) return;
      setState(() => _recognizing = false);
      final picked = await showModalBottomSheet<WastePrefill>(
        context: context,
        isScrollControlled: true,
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: VisionSuggestionList(
              result: result,
              onPick: (p) => Navigator.pop(ctx, p),
            ),
          ),
        ),
      );
      if (picked != null && mounted) await _openLog(picked);
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted && _recognizing) setState(() => _recognizing = false);
    }
  }

  Future<bool> _confirmDelete(String outletId, WasteItem item) async {
    final ok = await confirmAction(
      context,
      title: 'Delete this entry?',
      message: '${item.name} · ${fmtQty(item.qty)} ${item.unit} · ${fmtDay(item.date)}',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok || !mounted) return false;
    try {
      await context.read<ApiClient>().deleteWaste(outletId, item.id);
      if (!mounted) return true;
      showInfoSnackBar(context, 'Entry deleted');
      setState(() => _version++);
      return true;
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final outletId = context.watch<OutletProvider>().outletId;
    final canDelete = context.watch<AuthProvider>().user?.canManage ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Waste'),
        actions: [
          if (outletId != null)
            IconButton(
              tooltip: 'Recognise from photo',
              onPressed: _recognizing ? null : () => _photo(outletId),
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
        bottom: _recognizing
            ? const PreferredSize(preferredSize: Size.fromHeight(4), child: LinearProgressIndicator())
            : null,
      ),
      floatingActionButton: outletId == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openLog(),
              icon: const Icon(Icons.add),
              label: const Text('Log waste'),
            ),
      body: outletId == null
          ? const EmptyState(title: 'No outlets')
          : AsyncView<WasteResponse>(
              reloadKey: (outletId, _version),
              load: () => context.read<ApiClient>().waste(outletId),
              builder: (context, res, refresh) => RefreshIndicator(
                onRefresh: refresh,
                child: res.items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: const [
                          EmptyState(
                            icon: Icons.delete_outline,
                            title: 'No waste logged yet',
                            hint: 'Tap "Log waste" or the camera to record overproduction, spoilage and more.',
                          ),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                        itemCount: res.items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, i) {
                          final item = res.items[i];
                          if (!canDelete) return _WasteTile(item: item);
                          return Dismissible(
                            key: ValueKey('waste-${item.id}'),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.symmetric(horizontal: 20),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.error,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Icon(Icons.delete, color: Theme.of(context).colorScheme.onError),
                            ),
                            // The list reloads after a delete, so the tile itself never stays dismissed.
                            confirmDismiss: (_) async {
                              await _confirmDelete(outletId, item);
                              return false;
                            },
                            child: _WasteTile(item: item, onLongPress: () => _confirmDelete(outletId, item)),
                          );
                        },
                      ),
              ),
            ),
    );
  }
}

class _WasteTile extends StatelessWidget {
  const _WasteTile({required this.item, this.onLongPress});

  final WasteItem item;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: ListTile(
        onLongPress: onLongPress,
        leading: Icon(item.dishName != null ? Icons.restaurant : Icons.egg_outlined),
        title: Text(item.name),
        subtitle: Text('${fmtDay(item.date)} · ${reasonLabel(item.reason)}'),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('${fmtQty(item.qty)} ${item.unit}', style: theme.textTheme.titleSmall),
            Text(fmtRupees(item.value), style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

/// What the photo model saw. Tapping a suggestion calls [onPick] with values
/// for the waste log form.
class VisionSuggestionList extends StatelessWidget {
  const VisionSuggestionList({super.key, required this.result, required this.onPick});

  final VisionResult result;
  final ValueChanged<WastePrefill> onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('What the model sees', style: theme.textTheme.titleMedium),
        Text('Tap one to fill the waste form. Check the quantity before saving.',
            style: theme.textTheme.bodySmall?.copyWith(color: muted)),
        const SizedBox(height: 8),
        if (result.items.isEmpty)
          const EmptyState(icon: Icons.image_search, title: 'Nothing recognised', hint: 'Try another photo or log it by hand.')
        else
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final s in result.items)
                  Card(
                    child: ListTile(
                      key: ValueKey('suggestion-${s.label}'),
                      leading: const Icon(Icons.restaurant),
                      title: Text(s.displayName),
                      subtitle: Text(
                        '~${fmtQty(s.estimatedQty)} plates · ${(s.confidence * 100).round()}% confidence'
                        '${s.dishId == null ? ' · not on the menu' : ''}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => onPick(WastePrefill.fromSuggestion(s)),
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Text(
          [if (result.model.isNotEmpty) 'Model ${result.model}', if (result.note.isNotEmpty) result.note].join(' · '),
          style: theme.textTheme.bodySmall?.copyWith(color: muted),
        ),
      ],
    );
  }
}
