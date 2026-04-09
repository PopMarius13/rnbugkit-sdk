require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "rnbugkit-sdk"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://rnbugkit.io"
  s.license      = "MIT"
  s.authors      = { "Marius Pop" => "marius@rnbugkit.io" }

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/PopMariusIonut13/rnbugkit-sdk.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  s.dependency "React-Core"
end
