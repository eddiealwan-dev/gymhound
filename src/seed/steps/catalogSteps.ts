// The form demo's steps for the programs' 48 new catalog exercises (spec §18.29, R604, Appendix A): 2–4 plain steps
// each, in GymHound's voice. Keyed by exercise id (CATALOG_NEW_IDS in src/seed/newExerciseData.ts). Metcon steps give
// the format, the elements with their reps and loads, how to score and the cap; mobility steps say to stop short of
// pain; the moving events carry the program notes' safety line (stop at any back rounding beyond your normal).

export const CATALOG_STEPS: Readonly<Record<string, readonly string[]>> = {
  // Kettlebell (#8)
  'double-kettlebell-clean-and-press': [
    'Stand with a kettlebell in each hand between your feet. Hinge back, then snap your hips forward to swing both bells up to your shoulders.',
    'Rest the bells in the rack position, elbows tucked in front of your ribs, then press both overhead until your arms are straight.',
    'Keep your ribs down and your glutes tight so your lower back stays still on the press.',
    'Lower the bells back to the rack, then to the floor or into the next swing.',
  ],
  'kettlebell-swing': [
    'Stand with your feet a little wider than your shoulders and the kettlebell on the floor just in front of you.',
    'Hinge at the hips, grab the handle, hike the bell back between your legs, then drive your hips forward to swing it to chest height.',
    'Keep your arms loose and let the hips do the work. Your back stays flat the whole time.',
    'Let the bell fall back and hike it into the next rep.',
  ],
  'kettlebell-reverse-fly': [
    'Hold a kettlebell in each hand and hinge forward until your back is nearly flat, arms hanging below your shoulders.',
    'With a small bend in your elbows, raise the bells out to the sides until your arms are level with your back.',
    'Squeeze your shoulder blades together at the top and keep your neck long.',
    'Lower the bells slowly and keep the hinge steady between reps.',
  ],
  'armor-building-complex': [
    'Hold a kettlebell in each hand. One round is 2 cleans, 1 press and 3 front squats, with no rest between the moves.',
    'Clean both bells to your shoulders twice, press them overhead once, then bring them back to the rack.',
    'From the rack, squat down and stand up 3 times with your elbows tight to your ribs and your chest up.',
    'Put the bells down only at the end of the set. Log the rounds you finish as the reps.',
  ],
  'kettlebell-curl': [
    'Stand tall holding a kettlebell by the handle in each hand, arms at your sides and palms facing forward.',
    'Bend your elbows to curl the bells up toward your shoulders, keeping your upper arms still.',
    'Pause at the top without swinging your body.',
    'Lower slowly until your arms are straight.',
  ],
  // Glutes and lower body (#10)
  'side-lying-hip-abduction': [
    'Lie on your side with your legs straight and stacked, your head resting on your lower arm.',
    'Keep your top toes pointing forward, then lift the top leg up and slightly back, leading with the heel.',
    'Keep your hips stacked and do not roll backward as the leg rises.',
    'Lower the leg slowly. Do every rep on one side, then switch.',
  ],
  'paused-back-squat': [
    'Set the bar on your upper back, brace your core and step out with your feet about shoulder-width apart.',
    'Squat down under control until your thighs are at least parallel to the floor.',
    'Hold the bottom position for a full 1 to 2 seconds, staying tight with your chest up.',
    'Drive up through your whole foot without letting your hips shoot up first.',
  ],
  'heels-elevated-goblet-squat': [
    'Stand with your heels on a pair of small plates or a wedge, holding a dumbbell against your chest with both hands.',
    'Squat straight down between your knees until your thighs pass parallel, keeping your torso upright.',
    'Keep your elbows inside your knees and your heels pressed into the plates.',
    'Stand back up by pushing the floor away.',
  ],
  'dumbbell-hip-thrust': [
    'Sit on the floor with your upper back against a bench and a dumbbell resting across your hips.',
    'Plant your feet flat, about hip-width apart, with your knees bent.',
    'Drive through your heels to lift your hips until your shoulders, hips and knees make a straight line.',
    'Squeeze your glutes at the top, tuck your chin, then lower your hips under control.',
  ],
  'dumbbell-single-leg-romanian-deadlift': [
    'Stand on one foot with a dumbbell in the opposite hand, your standing knee slightly bent.',
    'Hinge at the hip and send your free leg straight back as the dumbbell slides down your standing leg.',
    'Keep your hips square to the floor and your back flat until you feel a stretch in the back of your leg.',
    'Squeeze your glute to stand tall again. Do every rep on one side, then switch.',
  ],
  // Mobility for Lifters (#14)
  'leg-swing': [
    'Stand next to a wall or rack and hold it with one hand, standing tall on one leg.',
    'Swing the other leg forward and back in a smooth arc, letting the range grow a little with each swing. Stop short of pain.',
    'Keep your torso upright and your standing knee soft.',
    'Do every swing on one side, then switch. You can also swing across your body from side to side.',
  ],
  'ninety-ninety-hip-switch': [
    'Sit on the floor with one knee bent in front of you and the other bent out to the side, both at about 90 degrees.',
    'Lift your knees and rotate your legs to the other side so the front shin becomes the back shin.',
    'Sit tall and use your hands for balance. Move only as far as feels comfortable and stop short of pain.',
    'Switch back and forth for the reps.',
  ],
  'couch-stretch': [
    'Kneel with the top of one foot against a wall or couch, shin up the wall, and the other foot flat in front of you in a lunge.',
    'Squeeze the glute of the back leg and tuck your pelvis under until you feel a stretch along the front of that thigh.',
    'Raise your chest as far as is comfortable and stop short of pain.',
    'Hold for the time, breathing slowly, then switch legs.',
  ],
  'knee-to-wall-ankle-rock': [
    'Face a wall in a half-kneeling stance with the front foot a few inches from the wall.',
    'Keeping your heel down, drive your front knee forward to touch the wall.',
    'Move the foot back a little at a time to find the farthest distance where your heel stays down. Stop short of pain.',
    'Rock in and out for the reps, then switch feet.',
  ],
  'cossack-squat': [
    'Stand in a wide stance with your toes pointing slightly out.',
    'Shift your weight onto one leg and sit back and down into that hip while the other leg stays straight, toes up.',
    'Keep your chest up and your bent knee tracking over your toes. Go only as low as you can control and stop short of pain.',
    'Drive back up and move to the other side.',
  ],
  'deep-goblet-squat-hold': [
    'Hold a dumbbell against your chest with both hands and set your feet a little wider than your shoulders, toes turned out.',
    'Squat down as deep as you can with your heels flat and your chest up.',
    'Press your elbows against the insides of your knees to open the hips. Stop short of pain.',
    'Hold the bottom for the time, breathing slowly.',
  ],
  'shoulder-cars': [
    'Stand tall with one arm hanging at your side and the rest of your body still.',
    'Make the biggest slow circle you can with that arm, up in front, overhead, behind and back down.',
    'Keep your ribs down and your hand in a loose fist. Stay in a range that is comfortable and stop short of pain.',
    'Do the reps in one direction, reverse, then switch arms.',
  ],
  'thoracic-open-book': [
    'Lie on your side with your knees bent to 90 degrees and stacked, and your arms straight out in front of you with palms together.',
    'Keeping your knees together, lift the top arm and rotate it up and back, following your hand with your eyes.',
    'Open as far as you can without your knees moving, and stop short of pain.',
    'Return slowly to the start. Do every rep on one side, then switch.',
  ],
  'wall-slide': [
    'Stand with your back, head and hips against a wall, feet a few inches out, and your arms up in a goalpost with elbows bent.',
    'Press your forearms and the backs of your hands against the wall, then slide your arms up as high as they go.',
    'Keep your ribs down and your lower back close to the wall. Stop short of pain.',
    'Slide back down with your arms in contact with the wall.',
  ],
  'band-dislocate': [
    'Hold a light band in front of your thighs with a wide overhand grip and straight arms.',
    'Raise the band overhead and keep going back behind you in one smooth arc, without bending your elbows.',
    'Use a wider grip if you need it. Stop short of pain, and keep your ribs down.',
    'Reverse the arc to bring the band back to the start.',
  ],
  'dumbbell-pullover-stretch': [
    'Lie on your back on a bench or the floor holding one light dumbbell upright with both hands above your chest.',
    'Keeping a soft bend in your elbows, lower the dumbbell back over your head until you feel a stretch under your arms.',
    'Keep your ribs down and your lower back flat. Stop short of pain.',
    'Hold for the time, breathing slowly, then bring the weight back over your chest.',
  ],
  'dead-hang': [
    'Grab a pull-up bar with an overhand grip, hands about shoulder-width apart, and step off so your feet leave the floor.',
    'Hang with your arms straight and your shoulders relaxed away from your ears.',
    'If your grip is the limit, bring your feet back to the floor or a box. Stop short of pain in your shoulders.',
    'Hold for the time, breathing steadily.',
  ],
  'hip-cars': [
    'Stand on one leg next to a wall or rack for balance, with the other knee lifted in front of you.',
    'Open that knee out to the side, then take it back and around, drawing the biggest slow circle your hip allows.',
    'Keep your torso still and your standing leg firm. Stop short of pain.',
    'Do the reps in one direction, reverse, then switch legs.',
  ],
  'jefferson-curl': [
    'Stand on a low box or plate holding a light dumbbell in front of your thighs, legs straight and knees soft.',
    'Tuck your chin and roll down slowly, one section of your spine at a time, until the weight hangs below your feet.',
    'Use a light weight and move slowly. Stop short of pain, and come up before your back feels pinched.',
    'Roll back up in the reverse order, head last.',
  ],
  'dumbbell-rdl-stretch-hold': [
    'Stand holding a dumbbell in each hand in front of your thighs, feet hip-width apart.',
    'Hinge at the hips and slide the weights down your legs, keeping your back flat and knees softly bent.',
    'Stop where you feel a strong stretch in the back of your legs and stop short of pain.',
    'Hold the bottom for the time, breathing slowly, then stand tall.',
  ],
  'pigeon-stretch': [
    'Start on all fours. Slide one knee forward behind your hand and angle your shin across your body.',
    'Stretch the other leg straight behind you with the top of the foot on the floor, and square your hips toward the floor.',
    'Fold your chest forward over the front shin as far as feels right. Stop short of pain.',
    'Hold for the time, breathing slowly, then switch sides.',
  ],
  // Calisthenics (#16)
  'band-face-pull': [
    'Anchor a band at about face height and hold an end in each hand, then step back until the band is taut.',
    'Pull the band toward your face, with your elbows high and wide, until your hands are beside your ears.',
    'Squeeze your shoulder blades together and keep your ribs down.',
    'Return slowly with your arms straight.',
  ],
  'single-leg-calf-raise': [
    'Stand on the ball of one foot on the edge of a step, holding a wall or rail lightly for balance.',
    'Lower your heel below the step for a full stretch.',
    'Rise as high as you can onto your toes and pause for a second.',
    'Lower slowly. Do every rep on one side, then switch.',
  ],
  'freestanding-handstand-practice': [
    'Warm up your wrists, then kick up into a handstand away from the wall, with a clear patch of floor around you.',
    'Spread your fingers, keep your arms locked and stack your shoulders, hips and feet in a line.',
    'Press through your fingertips if you lean forward and the heels of your hands if you lean back.',
    'Hold for the time, then come down under control. Learn to bail out by cartwheeling or stepping out first.',
  ],
  // Strongman's moving events (#19, R607)
  'yoke-carry': [
    'Set the yoke at the height of your upper back, step under it and brace your core, then drive up to lift it.',
    'Take quick, short steps for the distance, keeping your torso tall and your eyes forward.',
    'Stop and set it down at any back rounding beyond your normal, or if you lose control of the yoke.',
    'Lower the yoke to the supports with control and rest before the next run.',
  ],
  'farmers-carry-distance': [
    'Stand between the handles with your feet hip-width apart, then hinge down with a flat back and grip them.',
    'Stand tall with your shoulders back and walk the set distance in short, quick steps.',
    'Stop and set the handles down at any back rounding beyond your normal, or if your grip gives out.',
    'Put the handles down with a flat back before the next run.',
  ],
  'sandbag-carry': [
    'Stand over the sandbag, hinge down with a flat back, hug it to your chest and stand up with it.',
    'Keep it high and tight against your chest and walk the set distance in steady steps.',
    'Stop and set it down at any back rounding beyond your normal.',
    'Lower it to the floor with a flat back before the next run.',
  ],
  'sled-push-distance': [
    'Load the sled and grip the handles with your arms straight and your body leaning into it at about 45 degrees.',
    'Drive through the floor with long, powerful steps and keep your hips low.',
    'Push for the set distance at a steady pace, and stop if your back starts to round beyond your normal.',
    'Stop at the line and rest before the next run.',
  ],
  // A strength slot in #18 (F2)
  'toes-to-bar': [
    'Hang from a pull-up bar with your hands just outside your shoulders and your arms straight.',
    'Pull your shoulders down and back, then lift your toes up toward the bar by curling your hips and legs.',
    'Control the swing, so you do not kick your way up. Bend your knees to make it easier.',
    'Lower your legs under control and settle into the next rep.',
  ],
  // Runs and conditioning intervals (#9, #20)
  'easy-run': [
    'Run at a pace where you can talk in full sentences, on a track, road or treadmill.',
    'Start slowly for the first few minutes and let your breathing settle.',
    'Keep your steps short and your shoulders relaxed. Slow down if you cannot speak a full sentence.',
    'Log the time you run. The distance does not matter.',
  ],
  'interval-run': [
    'Warm up with an easy jog first, then run each hard interval at about 5 km pace, hard but repeatable.',
    'Jog or walk easily between intervals until your breathing settles.',
    'Run each interval at the same pace, so the last one is close to the first.',
    'Log each interval as a set with its time.',
  ],
  'tempo-run': [
    'Warm up with an easy jog, then settle into a steady pace you could hold for about an hour of racing.',
    'It should feel comfortably hard. You can say a few words, but not a full sentence.',
    'Hold the same effort for the whole time and relax your shoulders and hands.',
    'Log the time you run, then cool down with an easy jog or walk.',
  ],
  'long-run': [
    'Run at an easy, conversational pace on a route you can enjoy for a long stretch.',
    'Start slower than feels necessary. The pace should stay steady the whole way.',
    'Bring water if the run is long.',
    'Log the total time. The distance does not matter.',
  ],
  'bike-intervals': [
    'Set up a bike with a seat height where your knee is slightly bent at the bottom of the pedal stroke.',
    'Pedal hard for the work time, then ride easy for the rest between intervals.',
    'Keep your chest up and a steady cadence through each hard interval.',
    'Log each hard bike interval as a set with its time.',
  ],
  'rower-intervals': [
    'Sit on the rower with your feet strapped in and your shins vertical at the start.',
    'Row hard for the work time, driving with your legs first, then your back, then your arms.',
    'Row easy for the rest between intervals, keeping the same smooth stroke.',
    'Log each hard row as a set with its time.',
  ],
  'incline-treadmill-walk': [
    'Set the treadmill to a steep incline and a brisk walking speed.',
    'Walk upright with your arms swinging and without holding the rails.',
    'Keep a steady pace for the whole time, breathing deeply.',
    'Log the time you walk.',
  ],
  // Metcons (#17, #18): one score set each
  'metcon-amrap-10-squat-pushup-run': [
    'This is an AMRAP for 10 minutes. Each round is 10 goblet squats, 10 push-ups (scaled as needed) and a 200 m run.',
    'Start the clock and go through the round in order, resting only when you need to.',
    'Pace the first rounds so you can hold them. Hold a dumbbell or kettlebell at your chest for the squats.',
    'Your score is the number of complete rounds. Add the extra reps from the unfinished round as a note.',
  ],
  'metcon-3-rounds-row-thruster-ring-row': [
    '3 rounds for time. Each round is a 200 m row, 10 thrusters and 10 ring rows.',
    'Start the clock and do the round in order. Use an empty bar or light dumbbells for the thrusters.',
    'Stop the clock at the end of round 3. The time cap is 12 minutes.',
    'Your score is the time. If you reach the cap, score the work you finished.',
  ],
  'metcon-amrap-15-cindy-scaled': [
    'This is an AMRAP for 15 minutes. Each round is 5 pull-ups (scaled as needed), 10 push-ups and 15 air squats.',
    'Use ring rows if you cannot do pull-ups yet. Go through the round in order at a steady pace.',
    'Break the reps into small sets before you need to.',
    'Your score is the number of complete rounds. Add the extra reps from the unfinished round as a note.',
  ],
  'metcon-amrap-12-wallball-t2b-row': [
    'This is an AMRAP for 12 minutes. Each round is 10 wall balls, 10 toes-to-bar (scaled as needed) and a 12 cal row.',
    'Start the clock and go in order. Squat to depth and throw the wall ball to the target line.',
    'Scale the toes-to-bar down to knee raises if you need to.',
    'Your score is the number of complete rounds. Add the extra reps from the unfinished round as a note.',
  ],
  'metcon-21-15-9-thruster-pullup': [
    '21-15-9 for time. Do 21 thrusters then 21 pull-ups, then 15 and 15, then 9 and 9.',
    'The thruster load is 95 lb, or 65 lb for the lighter standard. Scale it so you can keep the reps unbroken in rounds 2 and 3.',
    'Scale the pull-ups as needed. Stop the clock after the last pull-up. The time cap is 8 minutes.',
    'Your score is the time. If you reach the cap, score the work you finished.',
  ],
  'metcon-amrap-25-run-wallball-burpee': [
    'This is an AMRAP for 25 minutes. Each round is a 400 m run, 15 wall balls and 10 burpees.',
    'Hold the same round time all the way through. Start a little slower than feels necessary.',
    'Squat to depth on every wall ball and touch your chest to the floor on every burpee.',
    'Your score is the number of complete rounds. Add the extra reps from the unfinished round as a note.',
  ],
  'metcon-5-rounds-db-snatch-c2b': [
    '5 rounds for time. Each round is 12 dumbbell snatches (alternating arms) and 10 chest-to-bar pull-ups.',
    'Start the clock and do the round in order. Switch arms every rep on the snatch.',
    'Scale the pull-ups to chin-over-bar or ring rows if you need to. Stop the clock at the end of round 5. The time cap is 15 minutes.',
    'Your score is the time. If you reach the cap, score the work you finished.',
  ],
};
