import SwiftUI

struct SafeAdaptive: View {
  var body: some View {
    GeometryReader { proxy in
      Text("Adaptive layout")
        .frame(maxWidth: proxy.size.width)
    }
  }
}
