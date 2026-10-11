// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_common_havok.sql';
import m0001 from './0001_green_wild_pack.sql';
import m0002 from './0002_nappy_spitfire.sql';
import m0003 from './0003_misty_texas_twister.sql';
import m0004 from './0004_sour_true_believers.sql';
import m0005 from './0005_peaceful_rictor.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  