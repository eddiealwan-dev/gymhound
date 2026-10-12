Pod::Spec.new do |s|
  s.name           = 'GymHoundMedia'
  s.version        = '1.0.0'
  s.summary        = 'Apple Music now playing and transport controls for GymHound'
  s.description    = 'Reads and controls MPMusicPlayerController.systemMusicPlayer (Apple Music content only).'
  s.author         = 'GymHound'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MediaPlayer'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
