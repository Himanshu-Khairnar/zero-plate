import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wasteless/models/models.dart';
import 'package:wasteless/screens/waste_log_screen.dart';
import 'package:wasteless/screens/waste_screen.dart';
import 'package:wasteless/theme.dart';

import 'helpers.dart';

const _options = {
  '/waste/options': {
    'dishes': [
      {'id': 'd1', 'name': 'Veg Biryani'},
      {'id': 'd2', 'name': 'Dal'},
    ],
    'ingredients': [
      {'id': 'i1', 'name': 'Tomato', 'unit': 'kg'},
    ],
    'reasons': ['spoilage', 'overproduction', 'plate_waste', 'prep_loss'],
  },
};

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('tapping a suggestion prefills the waste form', (tester) async {
    const result = VisionResult(
      items: [VisionSuggestion(label: 'biryani', dishName: 'Veg Biryani', dishId: 'd1', estimatedQty: 3.5, confidence: 0.82)],
      model: 'opencv-v1',
      note: 'tray area estimate',
    );
    WastePrefill? picked;
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(Brightness.light, useGoogleFonts: false),
      home: Scaffold(body: VisionSuggestionList(result: result, onPick: (p) => picked = p)),
    ));
    expect(find.text('~3.5 plates · 82% confidence'), findsOneWidget);
    expect(find.textContaining('opencv-v1'), findsOneWidget);
    await tester.tap(find.text('Veg Biryani'));
    expect(picked?.dishId, 'd1');

    await pumpScreen(tester, WasteLogScreen(prefill: picked), role: 'KITCHEN_STAFF', routes: _options);
    expect(find.text('Veg Biryani'), findsOneWidget); // selected in the dish dropdown
    expect(find.text('3.5'), findsOneWidget);
    expect(find.text('Overproduction'), findsOneWidget);
    expect(find.textContaining('Photo: biryani'), findsOneWidget);
  });
}
