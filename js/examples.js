// Example programs of the playground (from compiler/examples/ and the
// tutorial), all of them in Vigil Core, so that each one compiles to eBPF in
// the browser. `title` is per language; `packet` is the index in PACKETS of
// the packet to run the runnable ones on.
export const EXAMPLES = [
  {
    "id": "dns_drop",
    "title": {
      "pt": "Filtro DNS (Vigil Core, executável)",
      "en": "DNS filter (Vigil Core, runnable)"
    },
    "code": "# Drops IPv4 UDP datagrams to port 53, reading the bytes of the packet at\n# constant offsets: a program of Vigil Core, for `vigil build --certified`.\nfrom std.net import XdpContext, XdpAction, Byte\n\n@xdp\ndef dns_drop(ctx: XdpContext) -> XdpAction:\n    # EtherType 0x0800 (IPv4).\n    if ctx.parse[Byte](12)?.value != 8 or ctx.parse[Byte](13)?.value != 0:\n        return XdpAction.PASS\n    # No IP options, and UDP.\n    if ctx.parse[Byte](14)?.value != 0x45 or ctx.parse[Byte](23)?.value != 17:\n        return XdpAction.PASS\n    port = u16(ctx.parse[Byte](36)?.value) << 8 | u16(ctx.parse[Byte](37)?.value)\n    if port == 53:\n        return XdpAction.DROP\n    return XdpAction.PASS\n",
    "runnable": true,
    "packet": 0
  },
  {
    "id": "ttl_guard",
    "title": {
      "pt": "TTL quase esgotado (Vigil Core, executável)",
      "en": "Almost-expired TTL (Vigil Core, runnable)"
    },
    "code": "# Drops IPv4 packets whose TTL is almost exhausted.\nfrom std.net import XdpContext, XdpAction, Byte\n\n@xdp\ndef ttl_guard(ctx: XdpContext) -> XdpAction:\n    # EtherType at bytes 12-13: 0x0800 is IPv4.\n    if ctx.parse[Byte](12)?.value != 0x08 or ctx.parse[Byte](13)?.value != 0x00:\n        return XdpAction.PASS\n    # The TTL is byte 8 of the IPv4 header, which starts at byte 14.\n    ttl = ctx.parse[Byte](22)?.value\n    if ttl < 5:\n        return XdpAction.DROP\n    return XdpAction.PASS\n",
    "runnable": true,
    "packet": 3
  },
  {
    "id": "ones",
    "title": {
      "pt": "Laço sobre um array local (Vigil Core, executável)",
      "en": "Loop over a local array (Vigil Core, runnable)"
    },
    "code": "# Copies the first 8 bytes of the packet into a local array, then counts in\n# a bounded loop how many are 0xff: mostly-0xff packets are dropped.\nfrom std.net import XdpContext, XdpAction, Byte\n\n@xdp\ndef ones(ctx: XdpContext) -> XdpAction:\n    head: u8[8] = [0] * 8\n    head[0] = ctx.parse[Byte](0)?.value\n    head[1] = ctx.parse[Byte](1)?.value\n    head[2] = ctx.parse[Byte](2)?.value\n    head[3] = ctx.parse[Byte](3)?.value\n    head[4] = ctx.parse[Byte](4)?.value\n    head[5] = ctx.parse[Byte](5)?.value\n    head[6] = ctx.parse[Byte](6)?.value\n    head[7] = ctx.parse[Byte](7)?.value\n    count: u32 = 0\n    for i in range(8):\n        if head[i] == 0xff:\n            count += 1\n    if count > 4:\n        return XdpAction.DROP\n    return XdpAction.PASS\n",
    "runnable": true,
    "packet": 5
  },
  {
    "id": "mlp",
    "title": {
      "pt": "Classificador de pacotes (rede neural em inteiros, Vigil Core, executável)",
      "en": "Packet classifier (integer neural network, Vigil Core, runnable)"
    },
    "code": "# Classifies TCP segments with a small neural network in integer arithmetic\n# and drops the suspicious ones: a program of Vigil Core, so the playground\n# compiles and runs it.  Without maps there is no state, so each packet is\n# judged by its own headers.  The weights are illustrative, written by hand;\n# a trained model would be quantized to integers and put in their place.\nfrom std.net import XdpContext, XdpAction, Byte\n\n@xdp\ndef classify(ctx: XdpContext) -> XdpAction:\n    # IPv4 without options (EtherType 0x0800, first byte 0x45), and TCP.\n    if ctx.parse[Byte](12)?.value != 8 or ctx.parse[Byte](13)?.value != 0:\n        return XdpAction.PASS\n    if ctx.parse[Byte](14)?.value != 0x45 or ctx.parse[Byte](23)?.value != 6:\n        return XdpAction.PASS\n\n    # The features: a SYN without ACK, the bytes of payload (at most 64),\n    # a destination port below 1024, and the TTL in units of 16.\n    x: i32[4] = [0] * 4\n    if ctx.parse[Byte](47)?.value & 0x12 == 0x02:\n        x[0] = 1\n    total = i32(ctx.parse[Byte](16)?.value) << 8 | i32(ctx.parse[Byte](17)?.value)\n    payload = total - 20 - i32(ctx.parse[Byte](46)?.value >> 4) * 4\n    if payload > 64:\n        payload = 64\n    if payload > 0:\n        x[1] = payload\n    if ctx.parse[Byte](36)?.value < 4:\n        x[2] = 1\n    x[3] = i32(ctx.parse[Byte](22)?.value >> 4)\n\n    # A hidden layer of 4 neurons with ReLU, then one output: a SYN that\n    # carries data, a SYN to a privileged port, a low TTL, a large payload.\n    w1: i32[16] = [8, 1, 0, 0, 4, 0, 4, 0, 0, 0, 0, -2, 0, 1, 0, 0]\n    b1: i32[4] = [-8, -4, 2, -32]\n    w2: i32[4] = [4, 1, 2, -1]\n    score: i32 = -20\n    for j in range(4):\n        h: i32 = b1[j]\n        for i in range(4):\n            h += w1[j * 4 + i] * x[i]\n        if h > 0:\n            score += w2[j] * h\n    if score > 0:\n        return XdpAction.DROP\n    return XdpAction.PASS\n",
    "runnable": true,
    "packet": 2
  }
];
