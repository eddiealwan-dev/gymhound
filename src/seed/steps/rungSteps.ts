// The form demo's steps for the 59 new ladder rungs (spec §18.29, R604, Appendix B): 2–4 plain steps each, in
// GymHound's voice. Keyed by exercise id (RUNG_NEW_IDS in src/seed/newExerciseData.ts). A hold says how to hold and when
// the time counts; a negative says to lower for 3 to 5 seconds.

export const RUNG_STEPS: Readonly<Record<string, readonly string[]>> = {
  // Pull-up (#3, #17)
  'arch-hang': [
    'Hang from a pull-up bar with an overhand grip, hands a little wider than your shoulders and arms straight.',
    'Pull your shoulder blades down and back so your chest rises and your shoulders move away from your ears.',
    'Keep your ribs down and your legs still.',
    'Hold for the time. It counts only while your shoulders stay pulled down, so step off when they rise.',
  ],
  'negative-pull-up': [
    'Step or jump up so your chin is over the bar, hands a little wider than your shoulders.',
    'Lower yourself for 3 to 5 seconds, keeping your chest up and your legs still.',
    'Stop at the bottom with your arms straight, then step back up to the top.',
    'A rep counts only when the lowering takes at least 3 seconds.',
  ],
  'ring-row': [
    'Set the rings at about waist height. Hold them and walk your feet forward until your arms are straight and your body leans back.',
    'Keep your body in one straight line from head to heels.',
    'Pull your chest to your hands, elbows close to your sides, and squeeze your shoulder blades together.',
    'Lower slowly until your arms are straight. A more upright body is easier, a more level body is harder.',
  ],
  'chest-to-bar-pull-up': [
    'Hang from the bar with an overhand grip, hands a little wider than your shoulders and arms straight.',
    'Pull your elbows down and back, leaning back a little, until your chest touches the bar.',
    'A rep counts only when your chest reaches the bar, not just your chin.',
    'Lower under control to straight arms before the next rep.',
  ],
  // Squat (#3)
  'assisted-squat': [
    'Stand facing a sturdy support at about chest height, such as a rack or a door frame, feet shoulder-width apart.',
    'Sit your hips back and down, knees over your toes, and use your arms only as much as you need.',
    'Go as deep as you can with your heels flat on the floor.',
    'Push through your whole foot to stand. Use your arms less as you get stronger.',
  ],
  'shrimp-squat': [
    'Stand on one leg and hold the other foot behind you by the ankle. Reach your free arm forward for balance.',
    'Lower on the standing leg until your back knee touches the floor, leaning your chest forward a little.',
    'Keep your standing foot flat and your knee over your toes.',
    'Push through the standing foot to rise. Do every rep on one side, then switch.',
  ],
  // Dip (#3)
  'support-hold': [
    'Grip parallel bars and press up until your arms are straight, then lift your feet off the floor.',
    'Lock your elbows, push your shoulders down away from your ears and keep your chest tall.',
    'Keep your legs together and still, a little in front of you.',
    'Hold for the time. It counts only while your elbows are locked and your feet are off the floor.',
  ],
  'negative-dip': [
    'Press up to the top of parallel bars with straight arms and your shoulders down.',
    'Lean forward a little and lower for 3 to 5 seconds, until your upper arms are about level with the floor.',
    "Keep your elbows pointing back, not flared out, and don't let your shoulders shrug up.",
    'Use a step or a small jump to get back to the top, then repeat.',
  ],
  // Hinge (#3) and Nordic curl (#16)
  'bodyweight-romanian-deadlift': [
    'Stand tall with your feet hip-width apart and your knees slightly bent.',
    'Push your hips back and slide your hands down your thighs, keeping your back flat.',
    'Lower until you feel a stretch in the back of your thighs, usually around mid-shin.',
    'Squeeze your glutes to bring your hips forward and stand tall.',
  ],
  'hamstring-walkout': [
    'Lie on your back with your knees bent and feet flat, then lift your hips into a glute bridge.',
    'Keeping your hips up, walk your heels away from you one small step at a time until your legs are almost straight.',
    'Walk your heels back in the same way, keeping your hips level.',
    'Lower your hips to end the rep.',
  ],
  'band-assisted-nordic-curl': [
    'Kneel on a pad with your ankles held down by a partner or a heavy anchor. Fix a band high in front of you and hold it against your chest.',
    'Keep your body in a straight line from knees to head and lower forward slowly, bending only at the knees.',
    'The band carries part of your weight all the way down. Choose a band that lets you lower with control.',
    'Pull with your hamstrings to return to the start, using the band as little as you can.',
  ],
  'eccentric-nordic-curl': [
    'Kneel on a pad with your ankles held down by a partner or a heavy anchor. Keep your body straight from knees to head.',
    'Lower forward for 3 to 5 seconds, bending only at the knees and keeping your hips extended.',
    'Catch yourself with your hands on the floor when you can no longer control it.',
    'Push off your hands to return to the start, using as little push as you can.',
  ],
  // Row (#3)
  'vertical-row': [
    'Hold a pair of rings or straps with your feet close to the anchor, standing almost upright with your arms straight.',
    'Lean back a little, keeping your body in one straight line from head to heels.',
    'Pull your chest toward your hands, elbows close to your sides.',
    'Lower slowly to straight arms. Walk your feet forward to make it harder.',
  ],
  'incline-row': [
    'Set a bar or straps at about chest height. Hold on with an overhand grip and walk your feet forward until your body is on a slant.',
    'Keep your body in one straight line from head to heels.',
    'Pull your chest to your hands, elbows close to your sides.',
    'Lower slowly until your arms are straight.',
  ],
  'wide-grip-inverted-row': [
    'Set a bar at about waist height. Lie under it and hold it overhand, hands well wider than your shoulders.',
    'Lift your hips so your body is one straight line from heels to head.',
    'Pull your chest to the bar, elbows out to the sides, and squeeze your shoulder blades together.',
    'Lower slowly until your arms are straight.',
  ],
  'feet-elevated-inverted-row': [
    'Set a bar at about waist height. Lie under it, hold it overhand and rest your heels on a bench or box.',
    'Lift your hips so your body is one straight line from heels to head.',
    'Pull your chest to the bar, elbows close to your sides.',
    'Lower slowly until your arms are straight.',
  ],
  // Push-up (#3, #8, #17)
  'wall-push-up': [
    "Stand about an arm's length from a wall, with your hands on it at shoulder height and a little wider than your shoulders.",
    'Keep your body in one straight line from head to heels.',
    'Bend your elbows to bring your chest to the wall.',
    'Press back to straight arms.',
  ],
  'knee-push-up': [
    'Start on your hands and knees, hands under your shoulders, then walk your knees back so your body is straight from knees to head.',
    'Bend your elbows, angled back, to lower your chest to just above the floor.',
    'Keep your hips in line and your core tight.',
    'Press back up to straight arms.',
  ],
  'deficit-push-up': [
    'Put your hands on two plates, books or parallettes, and get into a push-up position with your body in one straight line.',
    'Lower until your chest drops below your hands, elbows angled back.',
    'Keep your hips in line and your core tight.',
    'Press back up to straight arms.',
  ],
  'archer-push-up': [
    'Start in a push-up position with your hands about twice shoulder-width apart.',
    'Lower toward one hand, bending that elbow while the other arm stays straight out to the side.',
    'Keep your body in one straight line.',
    'Press back up, then lower to the other side. Each side counts as one rep.',
  ],
  // Plank (#3)
  'standing-ab-wheel-rollout': [
    'Stand holding an ab wheel on the floor in front of your feet, with your knees straight or slightly bent.',
    'Roll the wheel forward, letting your arms and body reach long, with your ribs down and your lower back flat.',
    'Roll out only as far as you can keep your lower back from arching.',
    'Pull with your abs to bring the wheel back and stand tall.',
  ],
  // Hanging knee raise (#3, #17)
  'lying-knee-tuck': [
    'Lie on your back with your hands by your sides or under your hips, and lift your feet off the floor.',
    'Pull your knees toward your chest, curling your hips up a little.',
    'Lower your feet until they hover just above the floor, keeping your lower back down.',
  ],
  'lying-straight-leg-raise': [
    'Lie on your back with your legs straight and your hands by your sides or under your hips.',
    'Press your lower back into the floor, then raise your legs together until they point at the ceiling.',
    'Lower them slowly, stopping just above the floor, while your lower back stays down.',
  ],
  'hanging-knee-raise': [
    'Hang from a bar with an overhand grip, arms straight and shoulders pulled down.',
    'Raise your knees to hip height or higher, curling your hips up as you go.',
    'Lower slowly without swinging.',
  ],
  'hanging-bent-leg-raise': [
    'Hang from a bar with an overhand grip, arms straight and shoulders pulled down.',
    'With your knees bent, raise them toward your chest, curling your hips up until your thighs are well above level.',
    'Lower slowly without swinging, until your legs hang straight down.',
  ],
  // Front lever (#16, timed)
  'tuck-front-lever': [
    'Hang from a bar with an overhand grip and pull your knees to your chest.',
    'Lean back and lift your hips until your back is level with the floor, arms straight and shoulders pulled down.',
    'Keep your hips level with your shoulders.',
    'Hold for the time. It counts only while your back is level and your arms stay straight.',
  ],
  'advanced-tuck-front-lever': [
    'Get into a tuck front lever: knees to your chest, back level with the floor and arms straight.',
    'Open your hips so your knees move away from your chest, with your knees still bent and your back flat.',
    'Keep your shoulders pulled down.',
    'Hold for the time. It counts only while your back stays level with the floor.',
  ],
  'one-leg-front-lever': [
    'Get into an advanced tuck front lever with your back level with the floor and your arms straight.',
    'Straighten one leg out behind you and keep the other knee bent.',
    'Keep your hips level and your shoulders pulled down. Switch legs on the next set.',
    'Hold for the time. It counts only while your back stays level with the floor.',
  ],
  'straddle-front-lever': [
    'Get into a one-leg front lever with your back level with the floor and your arms straight.',
    'Straighten both legs and spread them wide.',
    'Keep your hips level with your shoulders and your arms straight.',
    'Hold for the time. It counts only while your body stays level with the floor.',
  ],
  'front-lever': [
    'Hang from a bar with an overhand grip and your arms straight.',
    'Lean back until your body is one straight line, level with the floor, with your legs together.',
    'Keep your shoulders pulled down, your arms straight and your glutes tight.',
    'Hold for the time. It counts only while your body stays straight and level.',
  ],
  // Front lever row (#16)
  'tuck-front-lever-row': [
    'Get into a tuck front lever: knees to your chest, back level with the floor and arms straight.',
    'Pull your body up toward the bar by bending your elbows, keeping your back level.',
    'Lower back to straight arms, slowly.',
  ],
  'advanced-tuck-front-lever-row': [
    'Get into an advanced tuck front lever: back level with the floor, knees bent and arms straight.',
    'Pull your body up toward the bar by bending your elbows, keeping your back level.',
    'Lower back to straight arms, slowly.',
  ],
  'straddle-front-lever-row': [
    'Get into a straddle front lever: legs straight and wide, body level with the floor and arms straight.',
    'Pull your body up toward the bar by bending your elbows, keeping your body level.',
    'Lower back to straight arms, slowly.',
  ],
  // Back lever (#16, timed)
  'tuck-back-lever': [
    'Hang from a bar or rings, pull your knees to your chest, then rotate backward until your body faces the floor.',
    'Lower your hips until your back is level with the floor, with your arms straight.',
    'Keep your shoulders pulled down and your knees tucked.',
    'Hold for the time. It counts only while your back is level and your arms stay straight.',
  ],
  'advanced-tuck-back-lever': [
    'Get into a tuck back lever: knees tucked, back level with the floor and arms straight.',
    'Open your hips so your knees move away from your chest, with your knees still bent and your back flat.',
    'Keep your shoulders pulled down and your arms straight.',
    'Hold for the time. It counts only while your back stays level with the floor.',
  ],
  'half-lay-back-lever': [
    'Get into an advanced tuck back lever with your back level with the floor and your arms straight.',
    'Open your hips so your thighs line up with your torso, with your knees still bent at about 90 degrees. In the advanced tuck your thighs are square to your torso.',
    'Keep your hips in line with your shoulders and your shoulders pulled down.',
    'Hold for the time. It counts only while your body stays level with the floor.',
  ],
  'straddle-back-lever': [
    'Get into a half-lay back lever with your body level with the floor and your arms straight.',
    'Straighten both legs and spread them wide.',
    'Keep your hips in line with your shoulders and your arms straight.',
    'Hold for the time. It counts only while your body stays level with the floor.',
  ],
  'back-lever': [
    'Hang from a bar or rings, then rotate backward until your body faces the floor, with your arms straight.',
    'Straighten your body into one line, level with the floor, with your legs together.',
    'Keep your shoulders pulled down and your glutes tight.',
    'Hold for the time. It counts only while your body stays straight and level.',
  ],
  // Planche (#16, timed)
  'planche-lean': [
    'Start in a push-up position with your arms straight and your hands turned out a little.',
    'Lean your shoulders forward as far as you can control, pushing the floor away.',
    'Keep your arms straight, your body in one line and your toes on the floor.',
    'Hold for the time. It counts only while your shoulders stay past your hands.',
  ],
  'tuck-planche': [
    'Crouch with your hands flat on the floor or on parallettes, arms straight, and lean forward over them.',
    'Lift your feet off the floor with your knees tucked to your chest, and push the floor away.',
    'Keep your arms straight and your back rounded, with your hips a little above your shoulders.',
    'Hold for the time. It counts only while both feet are off the floor.',
  ],
  'advanced-tuck-planche': [
    'Get into a tuck planche: arms straight, knees tucked and feet off the floor.',
    'Flatten your back until it is level with the floor, and move your knees away from your chest.',
    'Keep your arms straight and push the floor away.',
    'Hold for the time. It counts only while your feet are off the floor and your back is flat.',
  ],
  'straddle-planche': [
    'Get into an advanced tuck planche: arms straight, back flat and feet off the floor.',
    'Straighten both legs and spread them wide.',
    'Keep your arms straight, your body level and your glutes tight.',
    'Hold for the time. It counts only while your feet are off the floor and your body stays level.',
  ],
  // Muscle-up (#16, #18)
  'explosive-pull-up-and-dip': [
    'Hang from a bar and pull up as fast as you can, aiming the bar at your lower chest or higher.',
    'At the top, lean over the bar and press up to straight arms above it, as in a dip on a straight bar.',
    'Lower back to a hang. One pull-up and one dip is one rep.',
  ],
  'band-assisted-muscle-up': [
    'Loop a band over the bar and stand in it with one foot or a knee. Hang with an overhand grip, arms straight.',
    'Pull fast and high, leaning back a little, until the bar reaches your lower chest.',
    'Lean your chest over the bar and turn your elbows over it.',
    'Press to straight arms above the bar, then lower slowly to a hang.',
  ],
  'negative-muscle-up': [
    'Jump or step up so you are supported over the bar with your arms straight.',
    'Lean forward and lower through the turn for 3 to 5 seconds, until the bar is at your lower chest.',
    'Keep lowering with your elbows close, down to a hang with straight arms.',
    'Step back up to the top and repeat.',
  ],
  'ring-muscle-up': [
    'Hang from rings with a false grip, the heel of each hand on top of the ring and your arms straight.',
    'Pull the rings to your lower chest, keeping them close to your body.',
    'Turn your elbows over the rings quickly and lean your chest forward.',
    'Press to straight arms in support, turning the rings out a little at the top, then lower slowly back to a hang.',
  ],
  // Handstand push-up (#16, #18)
  'elevated-pike-push-up': [
    'Put your feet on a bench or box and your hands on the floor, with your hips high so your body makes an upside-down V.',
    'Bend your elbows to lower the top of your head to a point slightly in front of your hands.',
    'Keep your hips high and your elbows angled back, not flared out.',
    'Press back up until your arms are straight.',
  ],
  'partial-wall-handstand-push-up': [
    "Set a stack of pads on the floor between your hands, a hand's length from a wall. Kick up into a handstand facing the wall, hands about shoulder-width apart.",
    'Bend your elbows to lower your head until it touches the pads.',
    'Keep your core tight and your elbows angled back, not flared out.',
    'Press back up until your arms are straight. Take a pad away when the reps get easy.',
  ],
  'deficit-wall-handstand-push-up': [
    'Put your hands on two plates or parallettes and kick up into a handstand facing the wall.',
    'Bend your elbows to lower your head between your hands, below the level of your hands, until it touches the floor.',
    'Keep your core tight and your elbows angled back, not flared out.',
    'Press back up until your arms are straight.',
  ],
  // Pistol squat (#16)
  'box-pistol-squat': [
    'Stand on one leg in front of a box or bench, with your other leg lifted out in front of you.',
    'Sit your hips back and lower on the standing leg until you touch the box, reaching your arms forward for balance.',
    "Touch the box lightly. Don't drop onto it.",
    'Push through your whole foot to stand. Do every rep on one side, then switch.',
  ],
  'pistol-squat': [
    'Stand on one leg with your other leg lifted straight out in front of you and your arms forward.',
    'Sit your hips back and lower as deep as you can on the standing leg, keeping your heel flat.',
    'Keep your knee over your toes and your chest up.',
    'Push through your whole foot to stand. Do every rep on one side, then switch.',
  ],
  // L-sit (#16, #18, timed)
  'tuck-l-sit': [
    'Sit with your hands flat on the floor or on parallettes beside your hips, and press down until your arms are straight.',
    'Lift your hips and feet off the floor with your knees tucked.',
    'Push your shoulders down and keep your chest tall.',
    'Hold for the time. It counts only while your hips and feet are off the floor.',
  ],
  'one-leg-l-sit': [
    'Get into a tuck L-sit with your hands on the floor or on parallettes, arms straight and your hips and feet off the floor.',
    'Straighten one leg out in front of you, level with the floor, and keep the other knee tucked. Switch legs on the next set.',
    'Push your shoulders down and keep your chest tall.',
    'Hold for the time. It counts only while your hips and feet stay off the floor.',
  ],
  'l-sit': [
    'Sit with your hands flat on the floor or on parallettes beside your hips, and press down until your arms are straight.',
    'Lift your hips and legs off the floor, with both legs straight out in front of you and level with the floor.',
    'Push your shoulders down and keep your chest tall.',
    'Hold for the time. It counts only while your hips and heels are off the floor.',
  ],
  'v-sit': [
    'Get into an L-sit with your hands on the floor or on parallettes, arms straight and your legs level with the floor.',
    'Raise your straight legs higher than your hips, leaning your chest back a little, until your body makes a V.',
    'Push your shoulders down and keep your legs together.',
    'Hold for the time. It counts only while your legs stay above level with your hips.',
  ],
  // Box jump (#17)
  'box-step-up': [
    'Stand facing a box or bench at about knee height or lower, 12 to 16 inches.',
    'Put one foot fully on the box and drive through that heel to stand tall on top.',
    'Step back down slowly, lowering the other foot first and keeping the working foot on the box.',
    'Do every rep on one side, then switch.',
  ],
  // The three ring ladders (#16)
  'ring-push-up': [
    "Set the rings low, about a hand's length off the floor. Put a hand on each ring and get into a push-up position with your arms straight.",
    'Keep the rings still and your body in one straight line from head to heels.',
    'Lower your chest between the rings, elbows close to your sides.',
    'Press back up to straight arms, turning your hands out a little at the top.',
  ],
  'ring-biceps-curl': [
    'Set the rings at about head height. Hold them, walk your feet forward and lean back with your arms straight and your body in one line.',
    'Keep your elbows high and still, level with your shoulders.',
    'Curl your hands toward your forehead by bending your elbows.',
    'Lower slowly until your arms are straight.',
  ],
  'ring-triceps-extension': [
    'Set the rings at about waist height. Hold them and lean forward with your arms straight and your body in one line.',
    'Bend your elbows to lower your forehead toward your hands, keeping your elbows in place.',
    'Keep your hips in line and your core tight.',
    'Straighten your arms to press back up.',
  ],
};
