import Foundation
let app = CommandLine.arguments[1]
guard let b = Bundle(path: app) else { print("打不开这个 bundle"); exit(1) }
let locs = b.localizations.filter { $0.hasPrefix("zh") || $0.hasPrefix("en") }.sorted()
print("bundle 声明的中英文 localizations: \(locs)")
for lang in ["en", "zh-Hans", "zh_CN", "zh-Hant", "fr"] {
  let pref = Bundle.preferredLocalizations(from: b.localizations, forPreferences: [lang])
  var shown = "（没有 .lproj 覆盖 → 兜底）"
  if let first = pref.first,
     let p = b.path(forResource: "InfoPlist", ofType: "strings", inDirectory: nil, forLocalization: first),
     let d = NSDictionary(contentsOfFile: p) as? [String: Any],
     let n = d["CFBundleDisplayName"] as? String { shown = n }
  print("系统语言 \(lang) → 匹配到 \(pref.first ?? "无") → 显示「\(shown)」")
}
print("Info.plist 里的兜底值: \(b.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "无")")
