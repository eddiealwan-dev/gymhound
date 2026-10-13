# GymHound's local Expo module for the iCloud copy of the newest snapshot (spec §17.2).
# A local module has no package.json, so the fields are written here.
Pod::Spec.new do |s|
  s.name           = 'GymHoundCloudBackup'
  s.version        = '1.0.0'
  s.summary        = 'Copies GymHound snapshots to iCloud Drive and reads the newest back.'
  s.description    = 'Copies GymHound snapshots to the app iCloud Drive container and reads the newest back.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'GruntHound LLC'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
