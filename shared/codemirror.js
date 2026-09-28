let uo = [], FO = [];
(() => {
  let n = "lc,34,7n,7,7b,19,,,,2,,2,,,20,b,1c,l,g,,2t,7,2,6,2,2,,4,z,,u,r,2j,b,1m,9,9,,o,4,,9,,3,,5,17,3,1n,9,16,o,,x,1i,3,,i,,7,a,2,t,3,1k,,,7,2,2,2,3,9,,a,2,q,,2,3,1k,,,5,4,2,2,3,3,,u,2,3,,b,3,1k,,,8,,3,,3,k,2,m,6,,3,1k,,,7,2,2,2,3,7,3,a,2,u,,1n,5,3,3,,4,9,,14,5,1j,,,7,,3,,4,7,2,b,2,t,3,1k,,,7,,3,,4,7,2,b,2,f,,c,4,1j,2,,7,,3,,4,9,,a,2,t,3,1y,,4,6,,,,8,i,2,1p,,,8,c,8,2q,,,a,b,7,21,2,r,,,,,,4,2,1d,k,,2,5,b,,10,9,,2u,b,,6,n,4,4,3,g,4,d,,,3,6,,f,,jj,3,qa,4,s,3,t,2,u,2,1s,w,9,,19,3,,,39,2,y,,3a,c,4,c,63,5,1l,a,,,,,2,o,2,,1c,1a,2,c,k,5,1b,h,12,9,c,3,u,d,1k,e,1c,k,48,3,,l,4,,6,,2,3,5i,1s,ek,,5f,x,2da,3,3x,,2o,w,fe,6,2x,2,n9w,4,,a,w,2,28,2,7k,,3,,4,,n,5,4,,2b,2,1e,i,q,i,d,,12,8,p,d,18,4,1b,e,10,,1v,e,c,,8,2,1a,,1f,,,3,2,2,5,2,,,15,5,5,2,6k,8,,2,fn4,,kh,g,g,g,a6,2,gt,,6a,,45,5,1ae,3,,2,5,4,14,3,4,,4l,2,fx,4,1t,5,8t,2,25,6,1y,b,1d,4,3e,3,1h,f,15,,2,2,a,4,19,b,7,,1p,3,10,e,g,2,18,,c,3,1c,e,8,4,,2,2k,c,6,,2,,4d,c,l,4,1j,2,,7,2,2,2,3,9,,a,2,2,7,3,5,1v,9,,,2,,,4,,5,,,e,2,2a,i,n,,29,k,6j,7,2,9,r,2,2a,h,2y,d,2t,3,2,a,74,f,6t,6,,2,2,4,,,,2,3x,7,2,7,3,,s,a,14,7,,4,8,,9,b,1a,g,5i,8,5j,8,,8,2a,m,,e,3e,6,3,,,2,,7,,,1u,5,,2,,5,9n,4,9,2,,,1c,7,3,5,n,,44l,,6,f,8ug,i,1xc,5,1n,7,t4,,,1j,7,4,29,,b,2,f57,2,3mp,1a,2,n,f2,5,3,6,8,8,2,7,u,4,44,3,1iz,1j,4,1e,8,,e,,m,5,,f,11s,7,,h,2,7,,2,,5,2s,,4g,7,af,,1p,4,e4,4,72,2,6r,,2,,7,2,5,,d6,7,31,7,240,5".split(",").map((e) => e ? parseInt(e, 36) : 1);
  for (let e = 0, t = 0; e < n.length; e++)
    (e % 2 ? FO : uo).push(t = t + n[e]);
})();
function Qp(n) {
  if (n < 768) return !1;
  for (let e = 0, t = uo.length; ; ) {
    let i = e + t >> 1;
    if (n < uo[i]) t = i;
    else if (n >= FO[i]) e = i + 1;
    else return !0;
    if (e == t) return !1;
  }
}
function Qa(n) {
  return n >= 127462 && n <= 127487;
}
const Sa = 8205;
function Sp(n, e, t = !0, i = !0) {
  return (t ? HO : bp)(n, e, i);
}
function HO(n, e, t) {
  if (e == n.length) return e;
  e && KO(n.charCodeAt(e)) && JO(n.charCodeAt(e - 1)) && e--;
  let i = ys(n, e);
  for (e += ba(i); e < n.length; ) {
    let r = ys(n, e);
    if (i == Sa || r == Sa || t && Qp(r))
      e += ba(r), i = r;
    else if (Qa(r)) {
      let s = 0, o = e - 2;
      for (; o >= 0 && Qa(ys(n, o)); )
        s++, o -= 2;
      if (s % 2 == 0) break;
      e += 2;
    } else
      break;
  }
  return e;
}
function bp(n, e, t) {
  for (; e > 1; ) {
    let i = HO(n, e - 2, t);
    if (i < e) return i;
    e--;
  }
  return 0;
}
function ys(n, e) {
  let t = n.charCodeAt(e);
  if (!JO(t) || e + 1 == n.length) return t;
  let i = n.charCodeAt(e + 1);
  return KO(i) ? (t - 55296 << 10) + (i - 56320) + 65536 : t;
}
function KO(n) {
  return n >= 56320 && n < 57344;
}
function JO(n) {
  return n >= 55296 && n < 56320;
}
function ba(n) {
  return n < 65536 ? 1 : 2;
}
class Y {
  /**
  Get the line description around the given position.
  */
  lineAt(e) {
    if (e < 0 || e > this.length)
      throw new RangeError(`Invalid position ${e} in document of length ${this.length}`);
    return this.lineInner(e, !1, 1, 0);
  }
  /**
  Get the description for the given (1-based) line number.
  */
  line(e) {
    if (e < 1 || e > this.lines)
      throw new RangeError(`Invalid line number ${e} in ${this.lines}-line document`);
    return this.lineInner(e, !0, 1, 0);
  }
  /**
  Replace a range of the text with the given content.
  */
  replace(e, t, i) {
    [e, t] = Ci(this, e, t);
    let r = [];
    return this.decompose(
      0,
      e,
      r,
      2
      /* Open.To */
    ), i.length && i.decompose(
      0,
      i.length,
      r,
      3
      /* Open.To */
    ), this.decompose(
      t,
      this.length,
      r,
      1
      /* Open.From */
    ), it.from(r, this.length - (t - e) + i.length);
  }
  /**
  Append another document to this one.
  */
  append(e) {
    return this.replace(this.length, this.length, e);
  }
  /**
  Retrieve the text between the given points.
  */
  slice(e, t = this.length) {
    [e, t] = Ci(this, e, t);
    let i = [];
    return this.decompose(e, t, i, 0), it.from(i, t - e);
  }
  /**
  Test whether this text is equal to another instance.
  */
  eq(e) {
    if (e == this)
      return !0;
    if (e.length != this.length || e.lines != this.lines)
      return !1;
    let t = this.scanIdentical(e, 1), i = this.length - this.scanIdentical(e, -1), r = new tn(this), s = new tn(e);
    for (let o = t, l = t; ; ) {
      if (r.next(o), s.next(o), o = 0, r.lineBreak != s.lineBreak || r.done != s.done || r.value != s.value)
        return !1;
      if (l += r.value.length, r.done || l >= i)
        return !0;
    }
  }
  /**
  Iterate over the text. When `dir` is `-1`, iteration happens
  from end to start. This will return lines and the breaks between
  them as separate strings.
  */
  iter(e = 1) {
    return new tn(this, e);
  }
  /**
  Iterate over a range of the text. When `from` > `to`, the
  iterator will run in reverse.
  */
  iterRange(e, t = this.length) {
    return new ec(this, e, t);
  }
  /**
  Return a cursor that iterates over the given range of lines,
  _without_ returning the line breaks between, and yielding empty
  strings for empty lines.
  
  When `from` and `to` are given, they should be 1-based line numbers.
  */
  iterLines(e, t) {
    let i;
    if (e == null)
      i = this.iter();
    else {
      t == null && (t = this.lines + 1);
      let r = this.line(e).from;
      i = this.iterRange(r, Math.max(r, t == this.lines + 1 ? this.length : t <= 1 ? 0 : this.line(t - 1).to));
    }
    return new tc(i);
  }
  /**
  Return the document as a string, using newline characters to
  separate lines.
  */
  toString() {
    return this.sliceString(0);
  }
  /**
  Convert the document to an array of lines (which can be
  deserialized again via [`Text.of`](https://codemirror.net/6/docs/ref/#state.Text^of)).
  */
  toJSON() {
    let e = [];
    return this.flatten(e), e;
  }
  /**
  @internal
  */
  constructor() {
  }
  /**
  Create a `Text` instance for the given array of lines.
  */
  static of(e) {
    if (e.length == 0)
      throw new RangeError("A document must have at least one line");
    return e.length == 1 && !e[0] ? Y.empty : e.length <= 32 ? new ie(e) : it.from(ie.split(e, []));
  }
}
class ie extends Y {
  constructor(e, t = yp(e)) {
    super(), this.text = e, this.length = t;
  }
  get lines() {
    return this.text.length;
  }
  get children() {
    return null;
  }
  lineInner(e, t, i, r) {
    for (let s = 0; ; s++) {
      let o = this.text[s], l = r + o.length;
      if ((t ? i : l) >= e)
        return new kp(r, l, i, o);
      r = l + 1, i++;
    }
  }
  decompose(e, t, i, r) {
    let s = e <= 0 && t >= this.length ? this : new ie(ya(this.text, e, t), Math.min(t, this.length) - Math.max(0, e));
    if (r & 1) {
      let o = i.pop(), l = hr(s.text, o.text.slice(), 0, s.length);
      if (l.length <= 32)
        i.push(new ie(l, o.length + s.length));
      else {
        let a = l.length >> 1;
        i.push(new ie(l.slice(0, a)), new ie(l.slice(a)));
      }
    } else
      i.push(s);
  }
  replace(e, t, i) {
    if (!(i instanceof ie))
      return super.replace(e, t, i);
    [e, t] = Ci(this, e, t);
    let r = hr(this.text, hr(i.text, ya(this.text, 0, e)), t), s = this.length + i.length - (t - e);
    return r.length <= 32 ? new ie(r, s) : it.from(ie.split(r, []), s);
  }
  sliceString(e, t = this.length, i = `
`) {
    [e, t] = Ci(this, e, t);
    let r = "";
    for (let s = 0, o = 0; s <= t && o < this.text.length; o++) {
      let l = this.text[o], a = s + l.length;
      s > e && o && (r += i), e < a && t > s && (r += l.slice(Math.max(0, e - s), t - s)), s = a + 1;
    }
    return r;
  }
  flatten(e) {
    for (let t of this.text)
      e.push(t);
  }
  scanIdentical() {
    return 0;
  }
  static split(e, t) {
    let i = [], r = -1;
    for (let s of e)
      i.push(s), r += s.length + 1, i.length == 32 && (t.push(new ie(i, r)), i = [], r = -1);
    return r > -1 && t.push(new ie(i, r)), t;
  }
}
class it extends Y {
  constructor(e, t) {
    super(), this.children = e, this.length = t, this.lines = 0;
    for (let i of e)
      this.lines += i.lines;
  }
  lineInner(e, t, i, r) {
    for (let s = 0; ; s++) {
      let o = this.children[s], l = r + o.length, a = i + o.lines - 1;
      if ((t ? a : l) >= e)
        return o.lineInner(e, t, i, r);
      r = l + 1, i = a + 1;
    }
  }
  decompose(e, t, i, r) {
    for (let s = 0, o = 0; o <= t && s < this.children.length; s++) {
      let l = this.children[s], a = o + l.length;
      if (e <= a && t >= o) {
        let h = r & ((o <= e ? 1 : 0) | (a >= t ? 2 : 0));
        o >= e && a <= t && !h ? i.push(l) : l.decompose(e - o, t - o, i, h);
      }
      o = a + 1;
    }
  }
  replace(e, t, i) {
    if ([e, t] = Ci(this, e, t), i.lines < this.lines)
      for (let r = 0, s = 0; r < this.children.length; r++) {
        let o = this.children[r], l = s + o.length;
        if (e >= s && t <= l) {
          let a = o.replace(e - s, t - s, i), h = this.lines - o.lines + a.lines;
          if (a.lines < h >> 4 && a.lines > h >> 6) {
            let O = this.children.slice();
            return O[r] = a, new it(O, this.length - (t - e) + i.length);
          }
          return super.replace(s, l, a);
        }
        s = l + 1;
      }
    return super.replace(e, t, i);
  }
  sliceString(e, t = this.length, i = `
`) {
    [e, t] = Ci(this, e, t);
    let r = "";
    for (let s = 0, o = 0; s < this.children.length && o <= t; s++) {
      let l = this.children[s], a = o + l.length;
      o > e && s && (r += i), e < a && t > o && (r += l.sliceString(e - o, t - o, i)), o = a + 1;
    }
    return r;
  }
  flatten(e) {
    for (let t of this.children)
      t.flatten(e);
  }
  scanIdentical(e, t) {
    if (!(e instanceof it))
      return 0;
    let i = 0, [r, s, o, l] = t > 0 ? [0, 0, this.children.length, e.children.length] : [this.children.length - 1, e.children.length - 1, -1, -1];
    for (; ; r += t, s += t) {
      if (r == o || s == l)
        return i;
      let a = this.children[r], h = e.children[s];
      if (a != h)
        return i + a.scanIdentical(h, t);
      i += a.length + 1;
    }
  }
  static from(e, t = e.reduce((i, r) => i + r.length + 1, -1)) {
    let i = 0;
    for (let u of e)
      i += u.lines;
    if (i < 32) {
      let u = [];
      for (let d of e)
        d.flatten(u);
      return new ie(u, t);
    }
    let r = Math.max(
      32,
      i >> 5
      /* Tree.BranchShift */
    ), s = r << 1, o = r >> 1, l = [], a = 0, h = -1, O = [];
    function c(u) {
      let d;
      if (u.lines > s && u instanceof it)
        for (let p of u.children)
          c(p);
      else u.lines > o && (a > o || !a) ? (f(), l.push(u)) : u instanceof ie && a && (d = O[O.length - 1]) instanceof ie && u.lines + d.lines <= 32 ? (a += u.lines, h += u.length + 1, O[O.length - 1] = new ie(d.text.concat(u.text), d.length + 1 + u.length)) : (a + u.lines > r && f(), a += u.lines, h += u.length + 1, O.push(u));
    }
    function f() {
      a != 0 && (l.push(O.length == 1 ? O[0] : it.from(O, h)), h = -1, a = O.length = 0);
    }
    for (let u of e)
      c(u);
    return f(), l.length == 1 ? l[0] : new it(l, t);
  }
}
Y.empty = /* @__PURE__ */ new ie([""], 0);
function yp(n) {
  let e = -1;
  for (let t of n)
    e += t.length + 1;
  return e;
}
function hr(n, e, t = 0, i = 1e9) {
  for (let r = 0, s = 0, o = !0; s < n.length && r <= i; s++) {
    let l = n[s], a = r + l.length;
    a >= t && (a > i && (l = l.slice(0, i - r)), r < t && (l = l.slice(t - r)), o ? (e[e.length - 1] += l, o = !1) : e.push(l)), r = a + 1;
  }
  return e;
}
function ya(n, e, t) {
  return hr(n, [""], e, t);
}
class tn {
  constructor(e, t = 1) {
    this.dir = t, this.done = !1, this.lineBreak = !1, this.value = "", this.nodes = [e], this.offsets = [t > 0 ? 1 : (e instanceof ie ? e.text.length : e.children.length) << 1];
  }
  nextInner(e, t) {
    for (this.done = this.lineBreak = !1; ; ) {
      let i = this.nodes.length - 1, r = this.nodes[i], s = this.offsets[i], o = s >> 1, l = r instanceof ie ? r.text.length : r.children.length;
      if (o == (t > 0 ? l : 0)) {
        if (i == 0)
          return this.done = !0, this.value = "", this;
        t > 0 && this.offsets[i - 1]++, this.nodes.pop(), this.offsets.pop();
      } else if ((s & 1) == (t > 0 ? 0 : 1)) {
        if (this.offsets[i] += t, e == 0)
          return this.lineBreak = !0, this.value = `
`, this;
        e--;
      } else if (r instanceof ie) {
        let a = r.text[o + (t < 0 ? -1 : 0)];
        if (this.offsets[i] += t, a.length > Math.max(0, e))
          return this.value = e == 0 ? a : t > 0 ? a.slice(e) : a.slice(0, a.length - e), this;
        e -= a.length;
      } else {
        let a = r.children[o + (t < 0 ? -1 : 0)];
        e > a.length ? (e -= a.length, this.offsets[i] += t) : (t < 0 && this.offsets[i]--, this.nodes.push(a), this.offsets.push(t > 0 ? 1 : (a instanceof ie ? a.text.length : a.children.length) << 1));
      }
    }
  }
  next(e = 0) {
    return e < 0 && (this.nextInner(-e, -this.dir), e = this.value.length), this.nextInner(e, this.dir);
  }
}
class ec {
  constructor(e, t, i) {
    this.value = "", this.done = !1, this.cursor = new tn(e, t > i ? -1 : 1), this.pos = t > i ? e.length : 0, this.from = Math.min(t, i), this.to = Math.max(t, i);
  }
  nextInner(e, t) {
    if (t < 0 ? this.pos <= this.from : this.pos >= this.to)
      return this.value = "", this.done = !0, this;
    e += Math.max(0, t < 0 ? this.pos - this.to : this.from - this.pos);
    let i = t < 0 ? this.pos - this.from : this.to - this.pos;
    e > i && (e = i), i -= e;
    let { value: r } = this.cursor.next(e);
    return this.pos += (r.length + e) * t, this.value = r.length <= i ? r : t < 0 ? r.slice(r.length - i) : r.slice(0, i), this.done = !this.value, this;
  }
  next(e = 0) {
    return e < 0 ? e = Math.max(e, this.from - this.pos) : e > 0 && (e = Math.min(e, this.to - this.pos)), this.nextInner(e, this.cursor.dir);
  }
  get lineBreak() {
    return this.cursor.lineBreak && this.value != "";
  }
}
class tc {
  constructor(e) {
    this.inner = e, this.afterBreak = !0, this.value = "", this.done = !1;
  }
  next(e = 0) {
    let { done: t, lineBreak: i, value: r } = this.inner.next(e);
    return t && this.afterBreak ? (this.value = "", this.afterBreak = !1) : t ? (this.done = !0, this.value = "") : i ? this.afterBreak ? this.value = "" : (this.afterBreak = !0, this.next()) : (this.value = r, this.afterBreak = !1), this;
  }
  get lineBreak() {
    return !1;
  }
}
typeof Symbol < "u" && (Y.prototype[Symbol.iterator] = function() {
  return this.iter();
}, tn.prototype[Symbol.iterator] = ec.prototype[Symbol.iterator] = tc.prototype[Symbol.iterator] = function() {
  return this;
});
let kp = class {
  /**
  @internal
  */
  constructor(e, t, i, r) {
    this.from = e, this.to = t, this.number = i, this.text = r;
  }
  /**
  The length of the line (not including any line break after it).
  */
  get length() {
    return this.to - this.from;
  }
};
function Ci(n, e, t) {
  return e = Math.max(0, Math.min(n.length, e)), [e, Math.max(e, Math.min(n.length, t))];
}
function he(n, e, t = !0, i = !0) {
  return Sp(n, e, t, i);
}
function $p(n) {
  return n >= 56320 && n < 57344;
}
function xp(n) {
  return n >= 55296 && n < 56320;
}
function Ae(n, e) {
  let t = n.charCodeAt(e);
  if (!xp(t) || e + 1 == n.length)
    return t;
  let i = n.charCodeAt(e + 1);
  return $p(i) ? (t - 55296 << 10) + (i - 56320) + 65536 : t;
}
function pl(n) {
  return n <= 65535 ? String.fromCharCode(n) : (n -= 65536, String.fromCharCode((n >> 10) + 55296, (n & 1023) + 56320));
}
function nt(n) {
  return n < 65536 ? 1 : 2;
}
const po = /\r\n?|\n/;
var me = /* @__PURE__ */ function(n) {
  return n[n.Simple = 0] = "Simple", n[n.TrackDel = 1] = "TrackDel", n[n.TrackBefore = 2] = "TrackBefore", n[n.TrackAfter = 3] = "TrackAfter", n;
}(me || (me = {}));
class ht {
  // Sections are encoded as pairs of integers. The first is the
  // length in the current document, and the second is -1 for
  // unaffected sections, and the length of the replacement content
  // otherwise. So an insertion would be (0, n>0), a deletion (n>0,
  // 0), and a replacement two positive numbers.
  /**
  @internal
  */
  constructor(e) {
    this.sections = e;
  }
  /**
  The length of the document before the change.
  */
  get length() {
    let e = 0;
    for (let t = 0; t < this.sections.length; t += 2)
      e += this.sections[t];
    return e;
  }
  /**
  The length of the document after the change.
  */
  get newLength() {
    let e = 0;
    for (let t = 0; t < this.sections.length; t += 2) {
      let i = this.sections[t + 1];
      e += i < 0 ? this.sections[t] : i;
    }
    return e;
  }
  /**
  False when there are actual changes in this set.
  */
  get empty() {
    return this.sections.length == 0 || this.sections.length == 2 && this.sections[1] < 0;
  }
  /**
  Iterate over the unchanged parts left by these changes. `posA`
  provides the position of the range in the old document, `posB`
  the new position in the changed document.
  */
  iterGaps(e) {
    for (let t = 0, i = 0, r = 0; t < this.sections.length; ) {
      let s = this.sections[t++], o = this.sections[t++];
      o < 0 ? (e(i, r, s), r += s) : r += o, i += s;
    }
  }
  /**
  Iterate over the ranges changed by these changes. (See
  [`ChangeSet.iterChanges`](https://codemirror.net/6/docs/ref/#state.ChangeSet.iterChanges) for a
  variant that also provides you with the inserted text.)
  `fromA`/`toA` provides the extent of the change in the starting
  document, `fromB`/`toB` the extent of the replacement in the
  changed document.
  
  When `individual` is true, adjacent changes (which are kept
  separate for [position mapping](https://codemirror.net/6/docs/ref/#state.ChangeDesc.mapPos)) are
  reported separately.
  */
  iterChangedRanges(e, t = !1) {
    mo(this, e, t);
  }
  /**
  Get a description of the inverted form of these changes.
  */
  get invertedDesc() {
    let e = [];
    for (let t = 0; t < this.sections.length; ) {
      let i = this.sections[t++], r = this.sections[t++];
      r < 0 ? e.push(i, r) : e.push(r, i);
    }
    return new ht(e);
  }
  /**
  Compute the combined effect of applying another set of changes
  after this one. The length of the document after this set should
  match the length before `other`.
  */
  composeDesc(e) {
    return this.empty ? e : e.empty ? this : ic(this, e);
  }
  /**
  Map this description, which should start with the same document
  as `other`, over another set of changes, so that it can be
  applied after it. When `before` is true, map as if the changes
  in `this` happened before the ones in `other`.
  */
  mapDesc(e, t = !1) {
    return e.empty ? this : go(this, e, t);
  }
  mapPos(e, t = -1, i = me.Simple) {
    let r = 0, s = 0;
    for (let o = 0; o < this.sections.length; ) {
      let l = this.sections[o++], a = this.sections[o++], h = r + l;
      if (a < 0) {
        if (h > e)
          return s + (e - r);
        s += l;
      } else {
        if (i != me.Simple && h >= e && (i == me.TrackDel && r < e && h > e || i == me.TrackBefore && r < e || i == me.TrackAfter && h > e))
          return null;
        if (h > e || h == e && t < 0 && !l)
          return e == r || t < 0 ? s : s + a;
        s += a;
      }
      r = h;
    }
    if (e > r)
      throw new RangeError(`Position ${e} is out of range for changeset of length ${r}`);
    return s;
  }
  /**
  Check whether these changes touch a given range. When one of the
  changes entirely covers the range, the string `"cover"` is
  returned.
  */
  touchesRange(e, t = e) {
    for (let i = 0, r = 0; i < this.sections.length && r <= t; ) {
      let s = this.sections[i++], o = this.sections[i++], l = r + s;
      if (o >= 0 && r <= t && l >= e)
        return r < e && l > t ? "cover" : !0;
      r = l;
    }
    return !1;
  }
  /**
  @internal
  */
  toString() {
    let e = "";
    for (let t = 0; t < this.sections.length; ) {
      let i = this.sections[t++], r = this.sections[t++];
      e += (e ? " " : "") + i + (r >= 0 ? ":" + r : "");
    }
    return e;
  }
  /**
  Serialize this change desc to a JSON-representable value.
  */
  toJSON() {
    return this.sections;
  }
  /**
  Create a change desc from its JSON representation (as produced
  by [`toJSON`](https://codemirror.net/6/docs/ref/#state.ChangeDesc.toJSON).
  */
  static fromJSON(e) {
    if (!Array.isArray(e) || e.length % 2 || e.some((t) => typeof t != "number"))
      throw new RangeError("Invalid JSON representation of ChangeDesc");
    return new ht(e);
  }
  /**
  @internal
  */
  static create(e) {
    return new ht(e);
  }
}
class oe extends ht {
  constructor(e, t) {
    super(e), this.inserted = t;
  }
  /**
  Apply the changes to a document, returning the modified
  document.
  */
  apply(e) {
    if (this.length != e.length)
      throw new RangeError("Applying change set to a document with the wrong length");
    return mo(this, (t, i, r, s, o) => e = e.replace(r, r + (i - t), o), !1), e;
  }
  mapDesc(e, t = !1) {
    return go(this, e, t, !0);
  }
  /**
  Given the document as it existed _before_ the changes, return a
  change set that represents the inverse of this set, which could
  be used to go from the document created by the changes back to
  the document as it existed before the changes.
  */
  invert(e) {
    let t = this.sections.slice(), i = [];
    for (let r = 0, s = 0; r < t.length; r += 2) {
      let o = t[r], l = t[r + 1];
      if (l >= 0) {
        t[r] = l, t[r + 1] = o;
        let a = r >> 1;
        for (; i.length < a; )
          i.push(Y.empty);
        i.push(o ? e.slice(s, s + o) : Y.empty);
      }
      s += o;
    }
    return new oe(t, i);
  }
  /**
  Combine two subsequent change sets into a single set. `other`
  must start in the document produced by `this`. If `this` goes
  `docA` → `docB` and `other` represents `docB` → `docC`, the
  returned value will represent the change `docA` → `docC`.
  */
  compose(e) {
    return this.empty ? e : e.empty ? this : ic(this, e, !0);
  }
  /**
  Given another change set starting in the same document, maps this
  change set over the other, producing a new change set that can be
  applied to the document produced by applying `other`. When
  `before` is `true`, order changes as if `this` comes before
  `other`, otherwise (the default) treat `other` as coming first.
  
  Given two changes `A` and `B`, `A.compose(B.map(A))` and
  `B.compose(A.map(B, true))` will produce the same document. This
  provides a basic form of [operational
  transformation](https://en.wikipedia.org/wiki/Operational_transformation),
  and can be used for collaborative editing.
  */
  map(e, t = !1) {
    return e.empty ? this : go(this, e, t, !0);
  }
  /**
  Iterate over the changed ranges in the document, calling `f` for
  each, with the range in the original document (`fromA`-`toA`)
  and the range that replaces it in the new document
  (`fromB`-`toB`).
  
  When `individual` is true, adjacent changes are reported
  separately.
  */
  iterChanges(e, t = !1) {
    mo(this, e, t);
  }
  /**
  Get a [change description](https://codemirror.net/6/docs/ref/#state.ChangeDesc) for this change
  set.
  */
  get desc() {
    return ht.create(this.sections);
  }
  /**
  @internal
  */
  filter(e) {
    let t = [], i = [], r = [], s = new cn(this);
    e: for (let o = 0, l = 0; ; ) {
      let a = o == e.length ? 1e9 : e[o++];
      for (; l < a || l == a && s.len == 0; ) {
        if (s.done)
          break e;
        let O = Math.min(s.len, a - l);
        pe(r, O, -1);
        let c = s.ins == -1 ? -1 : s.off == 0 ? s.ins : 0;
        pe(t, O, c), c > 0 && Zt(i, t, s.text), s.forward(O), l += O;
      }
      let h = e[o++];
      for (; l < h; ) {
        if (s.done)
          break e;
        let O = Math.min(s.len, h - l);
        pe(t, O, -1), pe(r, O, s.ins == -1 ? -1 : s.off == 0 ? s.ins : 0), s.forward(O), l += O;
      }
    }
    return {
      changes: new oe(t, i),
      filtered: ht.create(r)
    };
  }
  /**
  Serialize this change set to a JSON-representable value.
  */
  toJSON() {
    let e = [];
    for (let t = 0; t < this.sections.length; t += 2) {
      let i = this.sections[t], r = this.sections[t + 1];
      r < 0 ? e.push(i) : r == 0 ? e.push([i]) : e.push([i].concat(this.inserted[t >> 1].toJSON()));
    }
    return e;
  }
  /**
  Create a change set for the given changes, for a document of the
  given length, using `lineSep` as line separator.
  */
  static of(e, t, i) {
    let r = [], s = [], o = 0, l = null;
    function a(O = !1) {
      if (!O && !r.length)
        return;
      o < t && pe(r, t - o, -1);
      let c = new oe(r, s);
      l = l ? l.compose(c.map(l)) : c, r = [], s = [], o = 0;
    }
    function h(O) {
      if (Array.isArray(O))
        for (let c of O)
          h(c);
      else if (O instanceof oe) {
        if (O.length != t)
          throw new RangeError(`Mismatched change set length (got ${O.length}, expected ${t})`);
        a(), l = l ? l.compose(O.map(l)) : O;
      } else {
        let { from: c, to: f = c, insert: u } = O;
        if (c > f || c < 0 || f > t)
          throw new RangeError(`Invalid change range ${c} to ${f} (in doc of length ${t})`);
        let d = u ? typeof u == "string" ? Y.of(u.split(i || po)) : u : Y.empty, p = d.length;
        if (c == f && p == 0)
          return;
        c < o && a(), c > o && pe(r, c - o, -1), pe(r, f - c, p), Zt(s, r, d), o = f;
      }
    }
    return h(e), a(!l), l;
  }
  /**
  Create an empty changeset of the given length.
  */
  static empty(e) {
    return new oe(e ? [e, -1] : [], []);
  }
  /**
  Create a changeset from its JSON representation (as produced by
  [`toJSON`](https://codemirror.net/6/docs/ref/#state.ChangeSet.toJSON).
  */
  static fromJSON(e) {
    if (!Array.isArray(e))
      throw new RangeError("Invalid JSON representation of ChangeSet");
    let t = [], i = [];
    for (let r = 0; r < e.length; r++) {
      let s = e[r];
      if (typeof s == "number")
        t.push(s, -1);
      else {
        if (!Array.isArray(s) || typeof s[0] != "number" || s.some((o, l) => l && typeof o != "string"))
          throw new RangeError("Invalid JSON representation of ChangeSet");
        if (s.length == 1)
          t.push(s[0], 0);
        else {
          for (; i.length < r; )
            i.push(Y.empty);
          i[r] = Y.of(s.slice(1)), t.push(s[0], i[r].length);
        }
      }
    }
    return new oe(t, i);
  }
  /**
  @internal
  */
  static createSet(e, t) {
    return new oe(e, t);
  }
}
function pe(n, e, t, i = !1) {
  if (e == 0 && t <= 0)
    return;
  let r = n.length - 2;
  r >= 0 && t <= 0 && t == n[r + 1] ? n[r] += e : r >= 0 && e == 0 && n[r] == 0 ? n[r + 1] += t : i ? (n[r] += e, n[r + 1] += t) : n.push(e, t);
}
function Zt(n, e, t) {
  if (t.length == 0)
    return;
  let i = e.length - 2 >> 1;
  if (i < n.length)
    n[n.length - 1] = n[n.length - 1].append(t);
  else {
    for (; n.length < i; )
      n.push(Y.empty);
    n.push(t);
  }
}
function mo(n, e, t) {
  let i = n.inserted;
  for (let r = 0, s = 0, o = 0; o < n.sections.length; ) {
    let l = n.sections[o++], a = n.sections[o++];
    if (a < 0)
      r += l, s += l;
    else {
      let h = r, O = s, c = Y.empty;
      for (; h += l, O += a, a && i && (c = c.append(i[o - 2 >> 1])), !(t || o == n.sections.length || n.sections[o + 1] < 0); )
        l = n.sections[o++], a = n.sections[o++];
      e(r, h, s, O, c), r = h, s = O;
    }
  }
}
function go(n, e, t, i = !1) {
  let r = [], s = i ? [] : null, o = new cn(n), l = new cn(e);
  for (let a = -1; ; ) {
    if (o.done && l.len || l.done && o.len)
      throw new Error("Mismatched change set lengths");
    if (o.ins == -1 && l.ins == -1) {
      let h = Math.min(o.len, l.len);
      pe(r, h, -1), o.forward(h), l.forward(h);
    } else if (l.ins >= 0 && (o.ins < 0 || a == o.i || o.off == 0 && (l.len < o.len || l.len == o.len && !t))) {
      let h = l.len;
      for (pe(r, l.ins, -1); h; ) {
        let O = Math.min(o.len, h);
        o.ins >= 0 && a < o.i && o.len <= O && (pe(r, 0, o.ins), s && Zt(s, r, o.text), a = o.i), o.forward(O), h -= O;
      }
      l.next();
    } else if (o.ins >= 0) {
      let h = 0, O = o.len;
      for (; O; )
        if (l.ins == -1) {
          let c = Math.min(O, l.len);
          h += c, O -= c, l.forward(c);
        } else if (l.ins == 0 && l.len < O)
          O -= l.len, l.next();
        else
          break;
      pe(r, h, a < o.i ? o.ins : 0), s && a < o.i && Zt(s, r, o.text), a = o.i, o.forward(o.len - O);
    } else {
      if (o.done && l.done)
        return s ? oe.createSet(r, s) : ht.create(r);
      throw new Error("Mismatched change set lengths");
    }
  }
}
function ic(n, e, t = !1) {
  let i = [], r = t ? [] : null, s = new cn(n), o = new cn(e);
  for (let l = !1; ; ) {
    if (s.done && o.done)
      return r ? oe.createSet(i, r) : ht.create(i);
    if (s.ins == 0)
      pe(i, s.len, 0, l), s.next();
    else if (o.len == 0 && !o.done)
      pe(i, 0, o.ins, l), r && Zt(r, i, o.text), o.next();
    else {
      if (s.done || o.done)
        throw new Error("Mismatched change set lengths");
      {
        let a = Math.min(s.len2, o.len), h = i.length;
        if (s.ins == -1) {
          let O = o.ins == -1 ? -1 : o.off ? 0 : o.ins;
          pe(i, a, O, l), r && O && Zt(r, i, o.text);
        } else o.ins == -1 ? (pe(i, s.off ? 0 : s.len, a, l), r && Zt(r, i, s.textBit(a))) : (pe(i, s.off ? 0 : s.len, o.off ? 0 : o.ins, l), r && !o.off && Zt(r, i, o.text));
        l = (s.ins > a || o.ins >= 0 && o.len > a) && (l || i.length > h), s.forward2(a), o.forward(a);
      }
    }
  }
}
class cn {
  constructor(e) {
    this.set = e, this.i = 0, this.next();
  }
  next() {
    let { sections: e } = this.set;
    this.i < e.length ? (this.len = e[this.i++], this.ins = e[this.i++]) : (this.len = 0, this.ins = -2), this.off = 0;
  }
  get done() {
    return this.ins == -2;
  }
  get len2() {
    return this.ins < 0 ? this.len : this.ins;
  }
  get text() {
    let { inserted: e } = this.set, t = this.i - 2 >> 1;
    return t >= e.length ? Y.empty : e[t];
  }
  textBit(e) {
    let { inserted: t } = this.set, i = this.i - 2 >> 1;
    return i >= t.length && !e ? Y.empty : t[i].slice(this.off, e == null ? void 0 : this.off + e);
  }
  forward(e) {
    e == this.len ? this.next() : (this.len -= e, this.off += e);
  }
  forward2(e) {
    this.ins == -1 ? this.forward(e) : e == this.ins ? this.next() : (this.ins -= e, this.off += e);
  }
}
class Xt {
  constructor(e, t, i, r) {
    this.from = e, this.to = t, this.flags = i, this.goalColumn = r;
  }
  /**
  The anchor of the range—the side that doesn't move when you
  extend it.
  */
  get anchor() {
    return this.flags & 32 ? this.to : this.from;
  }
  /**
  The head of the range, which is moved when the range is
  [extended](https://codemirror.net/6/docs/ref/#state.SelectionRange.extend).
  */
  get head() {
    return this.flags & 32 ? this.from : this.to;
  }
  /**
  True when `anchor` and `head` are at the same position.
  */
  get empty() {
    return this.from == this.to;
  }
  /**
  If this is a cursor that is explicitly associated with the
  character on one of its sides, this returns the side. -1 means
  the character before its position, 1 the character after, and 0
  means no association.
  */
  get assoc() {
    return this.flags & 8 ? -1 : this.flags & 16 ? 1 : 0;
  }
  /**
  A flag that, when set, makes some selection-extending commands
  treat the range's head and anchor as exchangeable, so that for
  example Shift-ArrowUp will make the lower side of the selection
  the anchor, even if that was the head before. Used to implement
  MacOS-style undirectional selections.
  */
  get undirectional() {
    return (this.flags & 64) > 0;
  }
  /**
  The bidirectional text level associated with this cursor, if
  any.
  */
  get bidiLevel() {
    let e = this.flags & 7;
    return e == 7 ? null : e;
  }
  /**
  Map this range through a change, producing a valid range in the
  updated document.
  */
  map(e, t = -1) {
    let i, r;
    return this.empty ? i = r = e.mapPos(this.from, t) : (i = e.mapPos(this.from, 1), r = e.mapPos(this.to, -1)), i == this.from && r == this.to ? this : new Xt(i, r, this.flags, this.goalColumn);
  }
  /**
  Extend this range to cover at least `from` to `to`.
  */
  extend(e, t = e, i = 0) {
    if (e <= this.anchor && t >= this.anchor)
      return S.range(e, t, void 0, void 0, i);
    let r = Math.abs(e - this.anchor) > Math.abs(t - this.anchor) ? e : t;
    return S.range(this.anchor, r, void 0, void 0, i);
  }
  /**
  Compare this range to another range.
  */
  eq(e, t = !1) {
    return this.anchor == e.anchor && this.head == e.head && this.goalColumn == e.goalColumn && (!t || !this.empty || this.assoc == e.assoc);
  }
  /**
  Return a JSON-serializable object representing the range.
  */
  toJSON() {
    return { anchor: this.anchor, head: this.head };
  }
  /**
  Convert a JSON representation of a range to a `SelectionRange`
  instance.
  */
  static fromJSON(e) {
    if (!e || typeof e.anchor != "number" || typeof e.head != "number")
      throw new RangeError("Invalid JSON representation for SelectionRange");
    return S.range(e.anchor, e.head);
  }
  /**
  @internal
  */
  static create(e, t, i, r) {
    return new Xt(e, t, i, r);
  }
}
class S {
  constructor(e, t) {
    this.ranges = e, this.mainIndex = t;
  }
  /**
  Map a selection through a change. Used to adjust the selection
  position for changes.
  */
  map(e, t = -1) {
    return e.empty ? this : S.create(this.ranges.map((i) => i.map(e, t)), this.mainIndex);
  }
  /**
  Compare this selection to another selection. By default, ranges
  are compared only by position. When `includeAssoc` is true,
  cursor ranges must also have the same
  [`assoc`](https://codemirror.net/6/docs/ref/#state.SelectionRange.assoc) value.
  */
  eq(e, t = !1) {
    if (this.ranges.length != e.ranges.length || this.mainIndex != e.mainIndex)
      return !1;
    for (let i = 0; i < this.ranges.length; i++)
      if (!this.ranges[i].eq(e.ranges[i], t))
        return !1;
    return !0;
  }
  /**
  Get the primary selection range. Usually, you should make sure
  your code applies to _all_ ranges, by using methods like
  [`changeByRange`](https://codemirror.net/6/docs/ref/#state.EditorState.changeByRange).
  */
  get main() {
    return this.ranges[this.mainIndex];
  }
  /**
  Make sure the selection only has one range. Returns a selection
  holding only the main range from this selection.
  */
  asSingle() {
    return this.ranges.length == 1 ? this : new S([this.main], 0);
  }
  /**
  Extend this selection with an extra range.
  */
  addRange(e, t = !0) {
    return S.create([e].concat(this.ranges), t ? 0 : this.mainIndex + 1);
  }
  /**
  Replace a given range with another range, and then normalize the
  selection to merge and sort ranges if necessary.
  */
  replaceRange(e, t = this.mainIndex) {
    let i = this.ranges.slice();
    return i[t] = e, S.create(i, this.mainIndex);
  }
  /**
  Convert this selection to an object that can be serialized to
  JSON.
  */
  toJSON() {
    return { ranges: this.ranges.map((e) => e.toJSON()), main: this.mainIndex };
  }
  /**
  Create a selection from a JSON representation.
  */
  static fromJSON(e) {
    if (!e || !Array.isArray(e.ranges) || typeof e.main != "number" || e.main >= e.ranges.length)
      throw new RangeError("Invalid JSON representation for EditorSelection");
    return new S(e.ranges.map((t) => Xt.fromJSON(t)), e.main);
  }
  /**
  Create a selection holding a single range.
  */
  static single(e, t = e) {
    return new S([S.range(e, t)], 0);
  }
  /**
  Sort and merge the given set of ranges, creating a valid
  selection.
  */
  static create(e, t = 0) {
    if (e.length == 0)
      throw new RangeError("A selection needs at least one range");
    for (let i = 0, r = 0; r < e.length; r++) {
      let s = e[r];
      if (s.empty ? s.from <= i : s.from < i)
        return S.normalized(e.slice(), t);
      i = s.to;
    }
    return new S(e, t);
  }
  /**
  Create a cursor selection range at the given position. You can
  safely ignore the optional arguments in most situations.
  */
  static cursor(e, t = 0, i, r) {
    return Xt.create(e, e, (t == 0 ? 0 : t < 0 ? 8 : 16) | (i == null ? 7 : Math.min(6, i)), r);
  }
  /**
  Create a selection range.
  */
  static range(e, t, i, r, s) {
    let o = r == null ? 7 : Math.min(6, r);
    return !s && e != t && (s = t < e ? 1 : -1), s && (o |= s < 0 ? 8 : 16), t < e ? Xt.create(t, e, o | 32, i) : Xt.create(e, t, o, i);
  }
  /**
  Create an [undirectional](https://codemirror.net/6/docs/ref/#state.SelectionRange.undirectional)
  selection range.
  */
  static undirectionalRange(e, t) {
    return Xt.create(e, t, 64, void 0);
  }
  /**
  @internal
  */
  static normalized(e, t = 0) {
    let i = e[t];
    e.sort((r, s) => r.from - s.from), t = e.indexOf(i);
    for (let r = 1; r < e.length; r++) {
      let s = e[r], o = e[r - 1];
      if (s.empty ? s.from <= o.to : s.from < o.to) {
        let l = o.from, a = Math.max(s.to, o.to);
        r <= t && t--, e.splice(--r, 2, s.anchor > s.head ? S.range(a, l) : S.range(l, a));
      }
    }
    return new S(e, t);
  }
}
function nc(n, e) {
  for (let t of n.ranges)
    if (t.to > e)
      throw new RangeError("Selection points outside of document");
}
let ml = 0;
class X {
  constructor(e, t, i, r, s) {
    this.combine = e, this.compareInput = t, this.compare = i, this.isStatic = r, this.id = ml++, this.default = e([]), this.extensions = typeof s == "function" ? s(this) : s;
  }
  /**
  Returns a facet reader for this facet, which can be used to
  [read](https://codemirror.net/6/docs/ref/#state.EditorState.facet) it but not to define values for it.
  */
  get reader() {
    return this;
  }
  /**
  Define a new facet.
  */
  static define(e = {}) {
    return new X(e.combine || ((t) => t), e.compareInput || ((t, i) => t === i), e.compare || (e.combine ? (t, i) => t === i : gl), !!e.static, e.enables);
  }
  /**
  Returns an extension that adds the given value to this facet.
  */
  of(e) {
    return new Or([], this, 0, e);
  }
  /**
  Create an extension that computes a value for the facet from a
  state. You must take care to declare the parts of the state that
  this value depends on, since your function is only called again
  for a new state when one of those parts changed.
  
  In cases where your value depends only on a single field, you'll
  want to use the [`from`](https://codemirror.net/6/docs/ref/#state.Facet.from) method instead.
  */
  compute(e, t) {
    if (this.isStatic)
      throw new Error("Can't compute a static facet");
    return new Or(e, this, 1, t);
  }
  /**
  Create an extension that computes zero or more values for this
  facet from a state.
  */
  computeN(e, t) {
    if (this.isStatic)
      throw new Error("Can't compute a static facet");
    return new Or(e, this, 2, t);
  }
  from(e, t) {
    return t || (t = (i) => i), this.compute([e], (i) => t(i.field(e)));
  }
}
function gl(n, e) {
  return n == e || n.length == e.length && n.every((t, i) => t === e[i]);
}
class Or {
  constructor(e, t, i, r) {
    this.dependencies = e, this.facet = t, this.type = i, this.value = r, this.id = ml++;
  }
  dynamicSlot(e) {
    var t;
    let i = this.value, r = this.facet.compareInput, s = this.id, o = e[s] >> 1, l = this.type == 2, a = !1, h = !1, O = [];
    for (let c of this.dependencies)
      c == "doc" ? a = !0 : c == "selection" ? h = !0 : ((t = e[c.id]) !== null && t !== void 0 ? t : 1) & 1 || O.push(e[c.id]);
    return {
      create(c) {
        return c.values[o] = i(c), 1;
      },
      update(c, f) {
        if (a && f.docChanged || h && (f.docChanged || f.selection) || Qo(c, O)) {
          let u = i(c);
          if (l ? !ka(u, c.values[o], r) : !r(u, c.values[o]))
            return c.values[o] = u, 1;
        }
        return 0;
      },
      reconfigure: (c, f) => {
        let u, d = f.config.address[s];
        if (d != null) {
          let p = $r(f, d);
          if (this.dependencies.every((g) => g instanceof X ? f.facet(g) === c.facet(g) : g instanceof $e ? f.field(g, !1) == c.field(g, !1) : !0) || (l ? ka(u = i(c), p, r) : r(u = i(c), p)))
            return c.values[o] = p, 0;
        } else
          u = i(c);
        return c.values[o] = u, 1;
      }
    };
  }
  get extension() {
    return this;
  }
}
function ka(n, e, t) {
  if (n.length != e.length)
    return !1;
  for (let i = 0; i < n.length; i++)
    if (!t(n[i], e[i]))
      return !1;
  return !0;
}
function Qo(n, e) {
  let t = !1;
  for (let i of e)
    nn(n, i) & 1 && (t = !0);
  return t;
}
function Pp(n, e, t) {
  let i = t.map((a) => n[a.id]), r = t.map((a) => a.type), s = i.filter((a) => !(a & 1)), o = n[e.id] >> 1;
  function l(a) {
    let h = [];
    for (let O = 0; O < i.length; O++) {
      let c = $r(a, i[O]);
      if (r[O] == 2)
        for (let f of c)
          h.push(f);
      else
        h.push(c);
    }
    return e.combine(h);
  }
  return {
    create(a) {
      for (let h of i)
        nn(a, h);
      return a.values[o] = l(a), 1;
    },
    update(a, h) {
      if (!Qo(a, s))
        return 0;
      let O = l(a);
      return e.compare(O, a.values[o]) ? 0 : (a.values[o] = O, 1);
    },
    reconfigure(a, h) {
      let O = Qo(a, i), c = h.config.facets[e.id], f = h.facet(e);
      if (c && !O && gl(t, c))
        return a.values[o] = f, 0;
      let u = l(a);
      return e.compare(u, f) ? (a.values[o] = f, 0) : (a.values[o] = u, 1);
    }
  };
}
const _n = /* @__PURE__ */ X.define({ static: !0 });
class $e {
  constructor(e, t, i, r, s) {
    this.id = e, this.createF = t, this.updateF = i, this.compareF = r, this.spec = s, this.provides = void 0;
  }
  /**
  Define a state field.
  */
  static define(e) {
    let t = new $e(ml++, e.create, e.update, e.compare || ((i, r) => i === r), e);
    return e.provide && (t.provides = e.provide(t)), t;
  }
  create(e) {
    let t = e.facet(_n).find((i) => i.field == this);
    return (t?.create || this.createF)(e);
  }
  /**
  @internal
  */
  slot(e) {
    let t = e[this.id] >> 1;
    return {
      create: (i) => (i.values[t] = this.create(i), 1),
      update: (i, r) => {
        let s = i.values[t], o = this.updateF(s, r);
        return this.compareF(s, o) ? 0 : (i.values[t] = o, 1);
      },
      reconfigure: (i, r) => {
        let s = i.facet(_n), o = r.facet(_n), l;
        return (l = s.find((a) => a.field == this)) && l != o.find((a) => a.field == this) ? (i.values[t] = l.create(i), 1) : r.config.address[this.id] != null ? (i.values[t] = r.field(this), 0) : (i.values[t] = this.create(i), 1);
      }
    };
  }
  /**
  Returns an extension that enables this field and overrides the
  way it is initialized. Can be useful when you need to provide a
  non-default starting value for the field.
  */
  init(e) {
    return [this, _n.of({ field: this, create: e })];
  }
  /**
  State field instances can be used as
  [`Extension`](https://codemirror.net/6/docs/ref/#state.Extension) values to enable the field in a
  given state.
  */
  get extension() {
    return this;
  }
}
const Kt = { lowest: 4, low: 3, default: 2, high: 1, highest: 0 };
function Vi(n) {
  return (e) => new rc(e, n);
}
const xt = {
  /**
  The highest precedence level, for extensions that should end up
  near the start of the precedence ordering.
  */
  highest: /* @__PURE__ */ Vi(Kt.highest),
  /**
  A higher-than-default precedence, for extensions that should
  come before those with default precedence.
  */
  high: /* @__PURE__ */ Vi(Kt.high),
  /**
  The default precedence, which is also used for extensions
  without an explicit precedence.
  */
  default: /* @__PURE__ */ Vi(Kt.default),
  /**
  A lower-than-default precedence.
  */
  low: /* @__PURE__ */ Vi(Kt.low),
  /**
  The lowest precedence level. Meant for things that should end up
  near the end of the extension order.
  */
  lowest: /* @__PURE__ */ Vi(Kt.lowest)
};
class rc {
  constructor(e, t) {
    this.inner = e, this.prec = t;
  }
  get extension() {
    return this;
  }
}
class ts {
  /**
  Create an instance of this compartment to add to your [state
  configuration](https://codemirror.net/6/docs/ref/#state.EditorStateConfig.extensions).
  */
  of(e) {
    return new So(this, e);
  }
  /**
  Create an [effect](https://codemirror.net/6/docs/ref/#state.TransactionSpec.effects) that
  reconfigures this compartment.
  */
  reconfigure(e) {
    return ts.reconfigure.of({ compartment: this, extension: e });
  }
  /**
  Get the current content of the compartment in the state, or
  `undefined` if it isn't present.
  */
  get(e) {
    return e.config.compartments.get(this);
  }
}
class So {
  constructor(e, t) {
    this.compartment = e, this.inner = t;
  }
  get extension() {
    return this;
  }
}
class kr {
  constructor(e, t, i, r, s, o) {
    for (this.base = e, this.compartments = t, this.dynamicSlots = i, this.address = r, this.staticValues = s, this.facets = o, this.statusTemplate = []; this.statusTemplate.length < i.length; )
      this.statusTemplate.push(
        0
        /* SlotStatus.Unresolved */
      );
  }
  staticFacet(e) {
    let t = this.address[e.id];
    return t == null ? e.default : this.staticValues[t >> 1];
  }
  static resolve(e, t, i) {
    let r = [], s = /* @__PURE__ */ Object.create(null), o = /* @__PURE__ */ new Map();
    for (let f of wp(e, t, o))
      f instanceof $e ? r.push(f) : (s[f.facet.id] || (s[f.facet.id] = [])).push(f);
    let l = /* @__PURE__ */ Object.create(null), a = [], h = [];
    for (let f of r)
      l[f.id] = h.length << 1, h.push((u) => f.slot(u));
    let O = i?.config.facets;
    for (let f in s) {
      let u = s[f], d = u[0].facet, p = O && O[f] || [];
      if (u.every(
        (g) => g.type == 0
        /* Provider.Static */
      ))
        if (l[d.id] = a.length << 1 | 1, gl(p, u))
          a.push(i.facet(d));
        else {
          let g = d.combine(u.map((Q) => Q.value));
          a.push(i && d.compare(g, i.facet(d)) ? i.facet(d) : g);
        }
      else {
        for (let g of u)
          g.type == 0 ? (l[g.id] = a.length << 1 | 1, a.push(g.value)) : (l[g.id] = h.length << 1, h.push((Q) => g.dynamicSlot(Q)));
        l[d.id] = h.length << 1, h.push((g) => Pp(g, d, u));
      }
    }
    let c = h.map((f) => f(l));
    return new kr(e, o, c, l, a, s);
  }
}
function wp(n, e, t) {
  let i = [[], [], [], [], []], r = /* @__PURE__ */ new Map();
  function s(o, l) {
    let a = r.get(o);
    if (a != null) {
      if (a <= l)
        return;
      let h = i[a].indexOf(o);
      h > -1 && i[a].splice(h, 1), o instanceof So && t.delete(o.compartment);
    }
    if (r.set(o, l), Array.isArray(o))
      for (let h of o)
        s(h, l);
    else if (o instanceof So) {
      if (t.has(o.compartment))
        throw new RangeError("Duplicate use of compartment in extensions");
      let h = e.get(o.compartment) || o.inner;
      t.set(o.compartment, h), s(h, l);
    } else if (o instanceof rc)
      s(o.inner, o.prec);
    else if (o instanceof $e)
      i[l].push(o), o.provides && s(o.provides, l);
    else if (o instanceof Or)
      i[l].push(o), o.facet.extensions && s(o.facet.extensions, Kt.default);
    else {
      let h = o.extension;
      if (!h)
        throw new Error(`Unrecognized extension value in extension set (${o}).`);
      if (h == o)
        throw new Error(`Unrecognized extension value in extension set (${o}). This sometimes happens because multiple instances of @codemirror/state are loaded, breaking instanceof checks.`);
      s(h, l);
    }
  }
  return s(n, Kt.default), i.reduce((o, l) => o.concat(l));
}
function nn(n, e) {
  if (e & 1)
    return 2;
  let t = e >> 1, i = n.status[t];
  if (i == 4)
    throw new Error("Cyclic dependency between fields and/or facets");
  if (i & 2)
    return i;
  n.status[t] = 4;
  let r = n.computeSlot(n, n.config.dynamicSlots[t]);
  return n.status[t] = 2 | r;
}
function $r(n, e) {
  return e & 1 ? n.config.staticValues[e >> 1] : n.values[e >> 1];
}
const sc = /* @__PURE__ */ X.define(), bo = /* @__PURE__ */ X.define({
  combine: (n) => n.some((e) => e),
  static: !0
}), oc = /* @__PURE__ */ X.define({
  combine: (n) => n.length ? n[0] : void 0,
  static: !0
}), lc = /* @__PURE__ */ X.define(), ac = /* @__PURE__ */ X.define(), hc = /* @__PURE__ */ X.define(), Oc = /* @__PURE__ */ X.define({
  combine: (n) => n.length ? n[0] : !1
});
class Pt {
  /**
  @internal
  */
  constructor(e, t) {
    this.type = e, this.value = t;
  }
  /**
  Define a new type of annotation.
  */
  static define() {
    return new vp();
  }
}
class vp {
  /**
  Create an instance of this annotation.
  */
  of(e) {
    return new Pt(this, e);
  }
}
class Tp {
  /**
  @internal
  */
  constructor(e) {
    this.map = e;
  }
  /**
  Create a [state effect](https://codemirror.net/6/docs/ref/#state.StateEffect) instance of this
  type.
  */
  of(e) {
    return new W(this, e);
  }
}
class W {
  /**
  @internal
  */
  constructor(e, t) {
    this.type = e, this.value = t;
  }
  /**
  Map this effect through a position mapping. Will return
  `undefined` when that ends up deleting the effect.
  */
  map(e) {
    let t = this.type.map(this.value, e);
    return t === void 0 ? void 0 : t == this.value ? this : new W(this.type, t);
  }
  /**
  Tells you whether this effect object is of a given
  [type](https://codemirror.net/6/docs/ref/#state.StateEffectType).
  */
  is(e) {
    return this.type == e;
  }
  /**
  Define a new effect type. The type parameter indicates the type
  of values that his effect holds. It should be a type that
  doesn't include `undefined`, since that is used in
  [mapping](https://codemirror.net/6/docs/ref/#state.StateEffect.map) to indicate that an effect is
  removed.
  */
  static define(e = {}) {
    return new Tp(e.map || ((t) => t));
  }
  /**
  Map an array of effects through a change set.
  */
  static mapEffects(e, t) {
    if (!e.length)
      return e;
    let i = [];
    for (let r of e) {
      let s = r.map(t);
      s && i.push(s);
    }
    return i;
  }
}
W.reconfigure = /* @__PURE__ */ W.define();
W.appendConfig = /* @__PURE__ */ W.define();
class ne {
  constructor(e, t, i, r, s, o) {
    this.startState = e, this.changes = t, this.selection = i, this.effects = r, this.annotations = s, this.scrollIntoView = o, this._doc = null, this._state = null, i && nc(i, t.newLength), s.some((l) => l.type == ne.time) || (this.annotations = s.concat(ne.time.of(Date.now())));
  }
  /**
  @internal
  */
  static create(e, t, i, r, s, o) {
    return new ne(e, t, i, r, s, o);
  }
  /**
  The new document produced by the transaction. Contrary to
  [`.state`](https://codemirror.net/6/docs/ref/#state.Transaction.state)`.doc`, accessing this won't
  force the entire new state to be computed right away, so it is
  recommended that [transaction
  filters](https://codemirror.net/6/docs/ref/#state.EditorState^transactionFilter) use this getter
  when they need to look at the new document.
  */
  get newDoc() {
    return this._doc || (this._doc = this.changes.apply(this.startState.doc));
  }
  /**
  The new selection produced by the transaction. If
  [`this.selection`](https://codemirror.net/6/docs/ref/#state.Transaction.selection) is undefined,
  this will [map](https://codemirror.net/6/docs/ref/#state.EditorSelection.map) the start state's
  current selection through the changes made by the transaction.
  */
  get newSelection() {
    return this.selection || this.startState.selection.map(this.changes);
  }
  /**
  The new state created by the transaction. Computed on demand
  (but retained for subsequent access), so it is recommended not to
  access it in [transaction
  filters](https://codemirror.net/6/docs/ref/#state.EditorState^transactionFilter) when possible.
  */
  get state() {
    return this._state || this.startState.applyTransaction(this), this._state;
  }
  /**
  Get the value of the given annotation type, if any.
  */
  annotation(e) {
    for (let t of this.annotations)
      if (t.type == e)
        return t.value;
  }
  /**
  Indicates whether the transaction changed the document.
  */
  get docChanged() {
    return !this.changes.empty;
  }
  /**
  Indicates whether this transaction reconfigures the state
  (through a [configuration compartment](https://codemirror.net/6/docs/ref/#state.Compartment) or
  with a top-level configuration
  [effect](https://codemirror.net/6/docs/ref/#state.StateEffect^reconfigure).
  */
  get reconfigured() {
    return this.startState.config != this.state.config;
  }
  /**
  Returns true if the transaction has a [user
  event](https://codemirror.net/6/docs/ref/#state.Transaction^userEvent) annotation that is equal to
  or more specific than `event`. For example, if the transaction
  has `"select.pointer"` as user event, `"select"` and
  `"select.pointer"` will match it.
  */
  isUserEvent(e) {
    let t = this.annotation(ne.userEvent);
    return !!(t && (t == e || t.length > e.length && t.slice(0, e.length) == e && t[e.length] == "."));
  }
}
ne.time = /* @__PURE__ */ Pt.define();
ne.userEvent = /* @__PURE__ */ Pt.define();
ne.addToHistory = /* @__PURE__ */ Pt.define();
ne.remote = /* @__PURE__ */ Pt.define();
function Xp(n, e) {
  let t = [];
  for (let i = 0, r = 0; ; ) {
    let s, o;
    if (i < n.length && (r == e.length || e[r] >= n[i]))
      s = n[i++], o = n[i++];
    else if (r < e.length)
      s = e[r++], o = e[r++];
    else
      return t;
    !t.length || t[t.length - 1] < s ? t.push(s, o) : t[t.length - 1] < o && (t[t.length - 1] = o);
  }
}
function cc(n, e, t) {
  var i;
  let r, s, o;
  return t ? (r = e.changes, s = oe.empty(e.changes.length), o = n.changes.compose(e.changes)) : (r = e.changes.map(n.changes), s = n.changes.mapDesc(e.changes, !0), o = n.changes.compose(r)), {
    changes: o,
    selection: e.selection ? e.selection.map(s) : (i = n.selection) === null || i === void 0 ? void 0 : i.map(r),
    effects: W.mapEffects(n.effects, r).concat(W.mapEffects(e.effects, s)),
    annotations: n.annotations.length ? n.annotations.concat(e.annotations) : e.annotations,
    scrollIntoView: n.scrollIntoView || e.scrollIntoView
  };
}
function yo(n, e, t) {
  let i = e.selection, r = yi(e.annotations);
  return e.userEvent && (r = r.concat(ne.userEvent.of(e.userEvent))), {
    changes: e.changes instanceof oe ? e.changes : oe.of(e.changes || [], t, n.facet(oc)),
    selection: i && (i instanceof S ? i : S.single(i.anchor, i.head)),
    effects: yi(e.effects),
    annotations: r,
    scrollIntoView: !!e.scrollIntoView
  };
}
function fc(n, e, t) {
  let i = yo(n, e.length ? e[0] : {}, n.doc.length);
  e.length && e[0].filter === !1 && (t = !1);
  for (let s = 1; s < e.length; s++) {
    e[s].filter === !1 && (t = !1);
    let o = !!e[s].sequential;
    i = cc(i, yo(n, e[s], o ? i.changes.newLength : n.doc.length), o);
  }
  let r = ne.create(n, i.changes, i.selection, i.effects, i.annotations, i.scrollIntoView);
  return Zp(t ? Cp(r) : r);
}
function Cp(n) {
  let e = n.startState, t = !0;
  for (let r of e.facet(lc)) {
    let s = r(n);
    if (s === !1) {
      t = !1;
      break;
    }
    Array.isArray(s) && (t = t === !0 ? s : Xp(t, s));
  }
  if (t !== !0) {
    let r, s;
    if (t === !1)
      s = n.changes.invertedDesc, r = oe.empty(e.doc.length);
    else {
      let o = n.changes.filter(t);
      r = o.changes, s = o.filtered.mapDesc(o.changes).invertedDesc;
    }
    n = ne.create(e, r, n.selection && n.selection.map(s), W.mapEffects(n.effects, s), n.annotations, n.scrollIntoView);
  }
  let i = e.facet(ac);
  for (let r = i.length - 1; r >= 0; r--) {
    let s = i[r](n);
    s instanceof ne ? n = s : Array.isArray(s) && s.length == 1 && s[0] instanceof ne ? n = s[0] : n = fc(e, yi(s), !1);
  }
  return n;
}
function Zp(n) {
  let e = n.startState, t = e.facet(hc), i = n;
  for (let r = t.length - 1; r >= 0; r--) {
    let s = t[r](n);
    s && Object.keys(s).length && (i = cc(i, yo(e, s, n.changes.newLength), !0));
  }
  return i == n ? n : ne.create(e, n.changes, n.selection, i.effects, i.annotations, i.scrollIntoView);
}
const Rp = [];
function yi(n) {
  return n == null ? Rp : Array.isArray(n) ? n : [n];
}
var J = /* @__PURE__ */ function(n) {
  return n[n.Word = 0] = "Word", n[n.Space = 1] = "Space", n[n.Other = 2] = "Other", n;
}(J || (J = {}));
const Ap = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
let ko;
try {
  ko = /* @__PURE__ */ new RegExp("[\\p{Alphabetic}\\p{Number}_]", "u");
} catch {
}
function qp(n) {
  if (ko)
    return ko.test(n);
  for (let e = 0; e < n.length; e++) {
    let t = n[e];
    if (/\w/.test(t) || t > "" && (t.toUpperCase() != t.toLowerCase() || Ap.test(t)))
      return !0;
  }
  return !1;
}
function jp(n) {
  return (e) => {
    if (!/\S/.test(e))
      return J.Space;
    if (qp(e))
      return J.Word;
    for (let t = 0; t < n.length; t++)
      if (e.indexOf(n[t]) > -1)
        return J.Word;
    return J.Other;
  };
}
class D {
  constructor(e, t, i, r, s, o) {
    this.config = e, this.doc = t, this.selection = i, this.values = r, this.status = e.statusTemplate.slice(), this.computeSlot = s, o && (o._state = this);
    for (let l = 0; l < this.config.dynamicSlots.length; l++)
      nn(this, l << 1);
    this.computeSlot = null;
  }
  field(e, t = !0) {
    let i = this.config.address[e.id];
    if (i == null) {
      if (t)
        throw new RangeError("Field is not present in this state");
      return;
    }
    return nn(this, i), $r(this, i);
  }
  /**
  Create a [transaction](https://codemirror.net/6/docs/ref/#state.Transaction) that updates this
  state. Any number of [transaction specs](https://codemirror.net/6/docs/ref/#state.TransactionSpec)
  can be passed. Unless
  [`sequential`](https://codemirror.net/6/docs/ref/#state.TransactionSpec.sequential) is set, the
  [changes](https://codemirror.net/6/docs/ref/#state.TransactionSpec.changes) (if any) of each spec
  are assumed to start in the _current_ document (not the document
  produced by previous specs), and its
  [selection](https://codemirror.net/6/docs/ref/#state.TransactionSpec.selection) and
  [effects](https://codemirror.net/6/docs/ref/#state.TransactionSpec.effects) are assumed to refer
  to the document created by its _own_ changes. The resulting
  transaction contains the combined effect of all the different
  specs. For [selection](https://codemirror.net/6/docs/ref/#state.TransactionSpec.selection), later
  specs take precedence over earlier ones.
  */
  update(...e) {
    return fc(this, e, !0);
  }
  /**
  @internal
  */
  applyTransaction(e) {
    let t = this.config, { base: i, compartments: r } = t;
    for (let l of e.effects)
      l.is(ts.reconfigure) ? (t && (r = /* @__PURE__ */ new Map(), t.compartments.forEach((a, h) => r.set(h, a)), t = null), r.set(l.value.compartment, l.value.extension)) : l.is(W.reconfigure) ? (t = null, i = l.value) : l.is(W.appendConfig) && (t = null, i = yi(i).concat(l.value));
    let s;
    t ? s = e.startState.values.slice() : (t = kr.resolve(i, r, this), s = new D(t, this.doc, this.selection, t.dynamicSlots.map(() => null), (a, h) => h.reconfigure(a, this), null).values);
    let o = e.startState.facet(bo) ? e.newSelection : e.newSelection.asSingle();
    new D(t, e.newDoc, o, s, (l, a) => a.update(l, e), e);
  }
  /**
  Create a [transaction spec](https://codemirror.net/6/docs/ref/#state.TransactionSpec) that
  replaces every selection range with the given content.
  */
  replaceSelection(e) {
    return typeof e == "string" && (e = this.toText(e)), this.changeByRange((t) => ({
      changes: { from: t.from, to: t.to, insert: e },
      range: S.cursor(t.from + e.length, -1)
    }));
  }
  /**
  Create a set of changes and a new selection by running the given
  function for each range in the active selection. The function
  can return an optional set of changes (in the coordinate space
  of the start document), plus an updated range (in the coordinate
  space of the document produced by the call's own changes). This
  method will merge all the changes and ranges into a single
  changeset and selection, and return it as a [transaction
  spec](https://codemirror.net/6/docs/ref/#state.TransactionSpec), which can be passed to
  [`update`](https://codemirror.net/6/docs/ref/#state.EditorState.update).
  */
  changeByRange(e) {
    let t = this.selection, i = e(t.ranges[0]), r = this.changes(i.changes), s = [i.range], o = yi(i.effects);
    for (let l = 1; l < t.ranges.length; l++) {
      let a = e(t.ranges[l]), h = this.changes(a.changes), O = h.map(r);
      for (let f = 0; f < l; f++)
        s[f] = s[f].map(O);
      let c = r.mapDesc(h, !0);
      s.push(a.range.map(c)), r = r.compose(O), o = W.mapEffects(o, O).concat(W.mapEffects(yi(a.effects), c));
    }
    return {
      changes: r,
      selection: S.create(s, t.mainIndex),
      effects: o
    };
  }
  /**
  Create a [change set](https://codemirror.net/6/docs/ref/#state.ChangeSet) from the given change
  description, taking the state's document length and line
  separator into account.
  */
  changes(e = []) {
    return e instanceof oe ? e : oe.of(e, this.doc.length, this.facet(D.lineSeparator));
  }
  /**
  Using the state's [line
  separator](https://codemirror.net/6/docs/ref/#state.EditorState^lineSeparator), create a
  [`Text`](https://codemirror.net/6/docs/ref/#state.Text) instance from the given string.
  */
  toText(e) {
    return Y.of(e.split(this.facet(D.lineSeparator) || po));
  }
  /**
  Return the given range of the document as a string.
  */
  sliceDoc(e = 0, t = this.doc.length) {
    return this.doc.sliceString(e, t, this.lineBreak);
  }
  /**
  Get the value of a state [facet](https://codemirror.net/6/docs/ref/#state.Facet).
  */
  facet(e) {
    let t = this.config.address[e.id];
    return t == null ? e.default : (nn(this, t), $r(this, t));
  }
  /**
  Convert this state to a JSON-serializable object. When custom
  fields should be serialized, you can pass them in as an object
  mapping property names (in the resulting object, which should
  not use `doc` or `selection`) to fields.
  */
  toJSON(e) {
    let t = {
      doc: this.sliceDoc(),
      selection: this.selection.toJSON()
    };
    if (e)
      for (let i in e) {
        let r = e[i];
        r instanceof $e && this.config.address[r.id] != null && (t[i] = r.spec.toJSON(this.field(e[i]), this));
      }
    return t;
  }
  /**
  Deserialize a state from its JSON representation. When custom
  fields should be deserialized, pass the same object you passed
  to [`toJSON`](https://codemirror.net/6/docs/ref/#state.EditorState.toJSON) when serializing as
  third argument.
  */
  static fromJSON(e, t = {}, i) {
    if (!e || typeof e.doc != "string")
      throw new RangeError("Invalid JSON representation for EditorState");
    let r = [];
    if (i) {
      for (let s in i)
        if (Object.prototype.hasOwnProperty.call(e, s)) {
          let o = i[s], l = e[s];
          r.push(o.init((a) => o.spec.fromJSON(l, a)));
        }
    }
    return D.create({
      doc: e.doc,
      selection: S.fromJSON(e.selection),
      extensions: t.extensions ? r.concat([t.extensions]) : r
    });
  }
  /**
  Create a new state. You'll usually only need this when
  initializing an editor—updated states are created by applying
  transactions.
  */
  static create(e = {}) {
    let t = kr.resolve(e.extensions || [], /* @__PURE__ */ new Map()), i = e.doc instanceof Y ? e.doc : Y.of((e.doc || "").split(t.staticFacet(D.lineSeparator) || po)), r = e.selection ? e.selection instanceof S ? e.selection : S.single(e.selection.anchor, e.selection.head) : S.single(0);
    return nc(r, i.length), t.staticFacet(bo) || (r = r.asSingle()), new D(t, i, r, t.dynamicSlots.map(() => null), (s, o) => o.create(s), null);
  }
  /**
  The size (in columns) of a tab in the document, determined by
  the [`tabSize`](https://codemirror.net/6/docs/ref/#state.EditorState^tabSize) facet.
  */
  get tabSize() {
    return this.facet(D.tabSize);
  }
  /**
  Get the proper [line-break](https://codemirror.net/6/docs/ref/#state.EditorState^lineSeparator)
  string for this state.
  */
  get lineBreak() {
    return this.facet(D.lineSeparator) || `
`;
  }
  /**
  Returns true when the editor is
  [configured](https://codemirror.net/6/docs/ref/#state.EditorState^readOnly) to be read-only.
  */
  get readOnly() {
    return this.facet(Oc);
  }
  /**
  Look up a translation for the given phrase (via the
  [`phrases`](https://codemirror.net/6/docs/ref/#state.EditorState^phrases) facet), or return the
  original string if no translation is found.
  
  If additional arguments are passed, they will be inserted in
  place of markers like `$1` (for the first value) and `$2`, etc.
  A single `$` is equivalent to `$1`, and `$$` will produce a
  literal dollar sign.
  */
  phrase(e, ...t) {
    for (let i of this.facet(D.phrases))
      if (Object.prototype.hasOwnProperty.call(i, e)) {
        e = i[e];
        break;
      }
    return t.length && (e = e.replace(/\$(\$|\d*)/g, (i, r) => {
      if (r == "$")
        return "$";
      let s = +(r || 1);
      return !s || s > t.length ? i : t[s - 1];
    })), e;
  }
  /**
  Find the values for a given language data field, provided by the
  the [`languageData`](https://codemirror.net/6/docs/ref/#state.EditorState^languageData) facet.
  
  Examples of language data fields are...
  
  - [`"commentTokens"`](https://codemirror.net/6/docs/ref/#commands.CommentTokens) for specifying
    comment syntax.
  - [`"autocomplete"`](https://codemirror.net/6/docs/ref/#autocomplete.autocompletion^config.override)
    for providing language-specific completion sources.
  - [`"wordChars"`](https://codemirror.net/6/docs/ref/#state.EditorState.charCategorizer) for adding
    characters that should be considered part of words in this
    language.
  - [`"closeBrackets"`](https://codemirror.net/6/docs/ref/#autocomplete.CloseBracketConfig) controls
    bracket closing behavior.
  */
  languageDataAt(e, t, i = -1) {
    let r = [];
    for (let s of this.facet(sc))
      for (let o of s(this, t, i))
        Object.prototype.hasOwnProperty.call(o, e) && r.push(o[e]);
    return r;
  }
  /**
  Return a function that can categorize strings (expected to
  represent a single [grapheme cluster](https://codemirror.net/6/docs/ref/#state.findClusterBreak))
  into one of:
  
   - Word (contains an alphanumeric character or a character
     explicitly listed in the local language's `"wordChars"`
     language data, which should be a string)
   - Space (contains only whitespace)
   - Other (anything else)
  */
  charCategorizer(e) {
    let t = this.languageDataAt("wordChars", e);
    return jp(t.length ? t[0] : "");
  }
  /**
  Find the word at the given position, meaning the range
  containing all [word](https://codemirror.net/6/docs/ref/#state.CharCategory.Word) characters
  around it. If no word characters are adjacent to the position,
  this returns null.
  */
  wordAt(e) {
    let { text: t, from: i, length: r } = this.doc.lineAt(e), s = this.charCategorizer(e), o = e - i, l = e - i;
    for (; o > 0; ) {
      let a = he(t, o, !1);
      if (s(t.slice(a, o)) != J.Word)
        break;
      o = a;
    }
    for (; l < r; ) {
      let a = he(t, l);
      if (s(t.slice(l, a)) != J.Word)
        break;
      l = a;
    }
    return o == l ? null : S.range(o + i, l + i);
  }
}
D.allowMultipleSelections = bo;
D.tabSize = /* @__PURE__ */ X.define({
  combine: (n) => n.length ? n[0] : 4
});
D.lineSeparator = oc;
D.readOnly = Oc;
D.phrases = /* @__PURE__ */ X.define({
  compare(n, e) {
    let t = Object.keys(n), i = Object.keys(e);
    return t.length == i.length && t.every((r) => n[r] == e[r]);
  }
});
D.languageData = sc;
D.changeFilter = lc;
D.transactionFilter = ac;
D.transactionExtender = hc;
ts.reconfigure = /* @__PURE__ */ W.define();
function Vt(n, e, t = {}) {
  let i = {};
  for (let r of n)
    for (let s of Object.keys(r)) {
      let o = r[s], l = i[s];
      if (l === void 0)
        i[s] = o;
      else if (!(l === o || o === void 0)) if (Object.hasOwnProperty.call(t, s))
        i[s] = t[s](l, o);
      else
        throw new Error("Config merge conflict for field " + s);
    }
  for (let r in e)
    i[r] === void 0 && (i[r] = e[r]);
  return i;
}
class jt {
  /**
  Compare this value with another value. Used when comparing
  rangesets. The default implementation compares by identity.
  Unless you are only creating a fixed number of unique instances
  of your value type, it is a good idea to implement this
  properly.
  */
  eq(e) {
    return this == e;
  }
  /**
  Create a [range](https://codemirror.net/6/docs/ref/#state.Range) with this value.
  */
  range(e, t = e) {
    return $o.create(e, t, this);
  }
}
jt.prototype.startSide = jt.prototype.endSide = 0;
jt.prototype.point = !1;
jt.prototype.mapMode = me.TrackDel;
function Ql(n, e) {
  return n == e || n.constructor == e.constructor && n.eq(e);
}
let $o = class uc {
  constructor(e, t, i) {
    this.from = e, this.to = t, this.value = i;
  }
  /**
  @internal
  */
  static create(e, t, i) {
    return new uc(e, t, i);
  }
};
function xo(n, e) {
  return n.from - e.from || n.value.startSide - e.value.startSide;
}
class Sl {
  constructor(e, t, i, r) {
    this.from = e, this.to = t, this.value = i, this.maxPoint = r;
  }
  get length() {
    return di(this.to);
  }
  // Find the index of the given position and side. Use the ranges'
  // `from` pos when `end == false`, `to` when `end == true`.
  findIndex(e, t, i, r = 0) {
    let s = i ? this.to : this.from;
    for (let o = r, l = s.length; ; ) {
      if (o == l)
        return o;
      let a = o + l >> 1, h = s[a] - e || (i ? this.value[a].endSide : this.value[a].startSide) - t;
      if (a == o)
        return h >= 0 ? o : l;
      h >= 0 ? l = a : o = a + 1;
    }
  }
  between(e, t, i, r) {
    for (let s = this.findIndex(t, -1e9, !0), o = this.findIndex(i, 1e9, !1, s); s < o; s++)
      if (r(this.from[s] + e, this.to[s] + e, this.value[s]) === !1)
        return !1;
  }
  map(e, t, i, r, s) {
    let o = [], l = [], a = [], h = -1, O = -1;
    e: for (let c = 0; c < this.value.length; c++) {
      let f = this.value[c], u = this.from[c] + e, d = this.to[c] + e, p, g;
      if (u == d) {
        let Q = t.mapPos(u, f.startSide, f.mapMode);
        if (Q == null || (p = g = Q, f.startSide != f.endSide && (g = t.mapPos(u, f.endSide), g < p)))
          continue;
      } else if (p = t.mapPos(u, f.startSide), g = t.mapPos(d, f.endSide), p > g || p == g && f.startSide > 0 && f.endSide <= 0)
        continue;
      if (!((g - p || f.endSide - f.startSide) < 0))
        if (h < 0 && (h = p), f.point && (O = Math.max(O, g - p)), (p - i || f.startSide - r) >= 0)
          o.push(f), l.push(p - h), a.push(g - h), i = g, r = f.endSide;
        else {
          if (p == g)
            for (let Q = o.length; Q > 0; Q--) {
              if ((p - (a[Q - 1] + h) || f.startSide - o[Q - 1].endSide) >= 0) {
                o.splice(Q, 0, f), l.splice(Q, 0, p - h), a.splice(Q, 0, g - h);
                continue e;
              }
              if ((p - (l[Q - 1] + h) || f.endSide - o[Q - 1].startSide) > 0)
                break;
            }
          s(p, g, f);
        }
    }
    return { mapped: o.length ? new Sl(l, a, o, O) : null, pos: h };
  }
}
class _ {
  constructor(e, t, i, r) {
    this.chunkPos = e, this.chunk = t, this.nextLayer = i, this.maxPoint = r;
  }
  /**
  @internal
  */
  static create(e, t, i, r) {
    return new _(e, t, i, r);
  }
  /**
  @internal
  */
  get length() {
    let e = this.chunk.length - 1;
    return e < 0 ? 0 : Math.max(this.chunkEnd(e), this.nextLayer.length);
  }
  /**
  The number of ranges in the set.
  */
  get size() {
    if (this.isEmpty)
      return 0;
    let e = this.nextLayer.size;
    for (let t of this.chunk)
      e += t.value.length;
    return e;
  }
  /**
  @internal
  */
  chunkEnd(e) {
    return this.chunkPos[e] + this.chunk[e].length;
  }
  /**
  Update the range set, optionally adding new ranges or filtering
  out existing ones.
  
  (Note: The type parameter is just there as a kludge to work
  around TypeScript variance issues that prevented `RangeSet<X>`
  from being a subtype of `RangeSet<Y>` when `X` is a subtype of
  `Y`.)
  */
  update(e) {
    let { add: t = [], sort: i = !1, filterFrom: r = 0, filterTo: s = this.length } = e, o = e.filter;
    if (t.length == 0 && !o)
      return this;
    if (i && (t = t.slice().sort(xo)), this.isEmpty)
      return t.length ? _.of(t) : this;
    let l = new dc(this, null, -1).goto(0), a = 0, h = [], O = new At();
    for (; l.value || a < t.length; )
      if (a < t.length && (l.from - t[a].from || l.startSide - t[a].value.startSide) >= 0) {
        let c = t[a++];
        O.addInner(c.from, c.to, c.value, !1) || h.push(c);
      } else l.rangeIndex == 1 && l.chunkIndex < this.chunk.length && (a == t.length || this.chunkEnd(l.chunkIndex) < t[a].from) && (!o || r > this.chunkEnd(l.chunkIndex) || s < this.chunkPos[l.chunkIndex]) && O.addChunk(this.chunkPos[l.chunkIndex], this.chunk[l.chunkIndex]) ? l.nextChunk() : ((!o || r > l.to || s < l.from || o(l.from, l.to, l.value)) && (O.addInner(l.from, l.to, l.value, !1) || h.push($o.create(l.from, l.to, l.value))), l.next());
    return O.finishInner(this.nextLayer.isEmpty && !h.length ? _.empty : this.nextLayer.update({ add: h, filter: o, filterFrom: r, filterTo: s }));
  }
  /**
  Map this range set through a set of changes, return the new set.
  */
  map(e) {
    if (e.empty || this.isEmpty)
      return this;
    let t = [], i = [], r = -1, s, o = (a, h, O) => {
      s || (s = new At()), s.addRange(a, h, O, !1);
    };
    for (let a = 0; a < this.chunk.length; a++) {
      let h = this.chunkPos[a], O = this.chunk[a], c = e.touchesRange(h, h + O.length);
      if (c === !1)
        r = Math.max(r, O.maxPoint), t.push(O), i.push(e.mapPos(h));
      else if (c === !0) {
        let [f, u] = t.length ? [di(i) + di(t).length, di(di(t).value).endSide] : [-1, -1], { mapped: d, pos: p } = O.map(h, e, f, u, o);
        d && (r = Math.max(r, d.maxPoint), t.push(d), i.push(p));
      }
    }
    let l = this.nextLayer.map(e);
    return s && (l = s.finishInner(l)), t.length == 0 ? l : new _(i, t, l || _.empty, r);
  }
  /**
  Iterate over the ranges that touch the region `from` to `to`,
  calling `f` for each. There is no guarantee that the ranges will
  be reported in any specific order. When the callback returns
  `false`, iteration stops.
  */
  between(e, t, i) {
    if (!this.isEmpty) {
      for (let r = 0; r < this.chunk.length; r++) {
        let s = this.chunkPos[r], o = this.chunk[r];
        if (t >= s && e <= s + o.length && o.between(s, e - s, t - s, i) === !1)
          return;
      }
      this.nextLayer.between(e, t, i);
    }
  }
  /**
  Iterate over the ranges in this set, in order, including all
  ranges that end at or after `from`.
  */
  iter(e = 0) {
    return fn.from([this]).goto(e);
  }
  /**
  @internal
  */
  get isEmpty() {
    return this.nextLayer == this;
  }
  /**
  Iterate over the ranges in a collection of sets, in order,
  starting from `from`.
  */
  static iter(e, t = 0) {
    return fn.from(e).goto(t);
  }
  /**
  Iterate over two groups of sets, calling methods on `comparator`
  to notify it of possible differences.
  */
  static compare(e, t, i, r, s = -1) {
    let o = e.filter((c) => c.maxPoint > 0 || !c.isEmpty && c.maxPoint >= s), l = t.filter((c) => c.maxPoint > 0 || !c.isEmpty && c.maxPoint >= s), a = $a(o, l, i), h = new Ui(o, a, s), O = new Ui(l, a, s);
    i.iterGaps((c, f, u) => xa(h, c, O, f, u, r)), i.empty && i.length == 0 && xa(h, 0, O, 0, 0, r);
  }
  /**
  Compare the contents of two groups of range sets, returning true
  if they are equivalent in the given range.
  */
  static eq(e, t, i = 0, r) {
    r == null && (r = 999999999);
    let s = e.filter((O) => !O.isEmpty && t.indexOf(O) < 0), o = t.filter((O) => !O.isEmpty && e.indexOf(O) < 0);
    if (s.length != o.length)
      return !1;
    if (!s.length)
      return !0;
    let l = $a(s, o), a = new Ui(s, l, 0).goto(i), h = new Ui(o, l, 0).goto(i);
    for (; ; ) {
      if (a.to != h.to || !Po(a.active, h.active) || a.point && (!h.point || !Ql(a.point, h.point)))
        return !1;
      if (a.to > r)
        return !0;
      a.next(), h.next();
    }
  }
  /**
  Iterate over a group of range sets at the same time, notifying
  the iterator about the ranges covering every given piece of
  content. Returns the open count (see
  [`SpanIterator.span`](https://codemirror.net/6/docs/ref/#state.SpanIterator.span)) at the end
  of the iteration.
  */
  static spans(e, t, i, r, s = -1) {
    let o = new Ui(e, null, s).goto(t), l = t, a = o.openStart;
    for (; ; ) {
      let h = Math.min(o.to, i);
      if (o.point) {
        let O = o.activeForPoint(o.to), c = o.pointFrom < t ? O.length + 1 : o.point.startSide < 0 ? O.length : Math.min(O.length, a);
        r.point(l, h, o.point, O, c, o.pointRank), a = Math.min(o.openEnd(h), O.length);
      } else h > l && (r.span(l, h, o.active, a), a = o.openEnd(h));
      if (o.to > i)
        return a + (o.point && o.to > i ? 1 : 0);
      l = o.to, o.next();
    }
  }
  /**
  Create a range set for the given range or array of ranges. By
  default, this expects the ranges to be _sorted_ (by start
  position and, if two start at the same position,
  `value.startSide`). You can pass `true` as second argument to
  cause the method to sort them.
  */
  static of(e, t = !1) {
    let i = new At();
    for (let r of e instanceof $o ? [e] : t ? Wp(e) : e)
      i.add(r.from, r.to, r.value);
    return i.finish();
  }
  /**
  Join an array of range sets into a single set.
  */
  static join(e) {
    if (!e.length)
      return _.empty;
    let t = di(e);
    for (let i = e.length - 2; i >= 0; i--)
      for (let r = e[i]; r != _.empty; r = r.nextLayer)
        t = new _(r.chunkPos, r.chunk, t, Math.max(r.maxPoint, t.maxPoint));
    return t;
  }
}
_.empty = /* @__PURE__ */ new _([], [], null, -1);
function di(n) {
  return n[n.length - 1];
}
function Wp(n) {
  if (n.length > 1)
    for (let e = n[0], t = 1; t < n.length; t++) {
      let i = n[t];
      if (xo(e, i) > 0)
        return n.slice().sort(xo);
      e = i;
    }
  return n;
}
_.empty.nextLayer = _.empty;
class At {
  finishChunk(e) {
    this.chunks.push(new Sl(this.from, this.to, this.value, this.maxPoint)), this.chunkPos.push(this.chunkStart), this.chunkStart = -1, this.setMaxPoint = Math.max(this.setMaxPoint, this.maxPoint), this.maxPoint = -1, e && (this.from = [], this.to = [], this.value = []);
  }
  /**
  Create an empty builder.
  */
  constructor() {
    this.chunks = [], this.chunkPos = [], this.chunkStart = -1, this.last = null, this.lastFrom = -1e9, this.lastTo = -1e9, this.from = [], this.to = [], this.value = [], this.maxPoint = -1, this.setMaxPoint = -1, this.nextLayer = null;
  }
  /**
  Add a range. Ranges should be added in sorted (by `from` and
  `value.startSide`) order.
  */
  add(e, t, i) {
    this.addRange(e, t, i, !0);
  }
  /**
  @internal
  */
  addRange(e, t, i, r) {
    this.addInner(e, t, i, r) || (this.nextLayer || (this.nextLayer = new At())).addRange(e, t, i, r);
  }
  /**
  @internal
  */
  addInner(e, t, i, r) {
    let s = e - this.lastTo || i.startSide - this.last.endSide;
    if (r && s <= 0 && (e - this.lastFrom || i.startSide - this.last.startSide) < 0)
      throw new Error("Ranges must be added sorted by `from` position and `startSide`");
    return s < 0 ? !1 : (this.from.length == 250 && this.finishChunk(!0), this.chunkStart < 0 && (this.chunkStart = e), this.from.push(e - this.chunkStart), this.to.push(t - this.chunkStart), this.last = i, this.lastFrom = e, this.lastTo = t, this.value.push(i), i.point && (this.maxPoint = Math.max(this.maxPoint, t - e)), !0);
  }
  /**
  @internal
  */
  addChunk(e, t) {
    if ((e - this.lastTo || t.value[0].startSide - this.last.endSide) < 0)
      return !1;
    this.from.length && this.finishChunk(!0), this.setMaxPoint = Math.max(this.setMaxPoint, t.maxPoint), this.chunks.push(t), this.chunkPos.push(e);
    let i = t.value.length - 1;
    return this.last = t.value[i], this.lastFrom = t.from[i] + e, this.lastTo = t.to[i] + e, !0;
  }
  /**
  Finish the range set. Returns the new set. The builder can't be
  used anymore after this has been called.
  */
  finish() {
    return this.finishInner(_.empty);
  }
  /**
  @internal
  */
  finishInner(e) {
    if (this.from.length && this.finishChunk(!1), this.chunks.length == 0)
      return e;
    let t = _.create(this.chunkPos, this.chunks, this.nextLayer ? this.nextLayer.finishInner(e) : e, this.setMaxPoint);
    return this.from = null, t;
  }
}
function $a(n, e, t) {
  let i = /* @__PURE__ */ new Map();
  for (let s of n)
    for (let o = 0; o < s.chunk.length; o++)
      s.chunk[o].maxPoint <= 0 && i.set(s.chunk[o], s.chunkPos[o]);
  let r = /* @__PURE__ */ new Set();
  for (let s of e)
    for (let o = 0; o < s.chunk.length; o++) {
      let l = i.get(s.chunk[o]);
      l != null && (t ? t.mapPos(l) : l) == s.chunkPos[o] && !t?.touchesRange(l, l + s.chunk[o].length) && r.add(s.chunk[o]);
    }
  return r;
}
class dc {
  constructor(e, t, i, r = 0) {
    this.layer = e, this.skip = t, this.minPoint = i, this.rank = r;
  }
  get startSide() {
    return this.value ? this.value.startSide : 0;
  }
  get endSide() {
    return this.value ? this.value.endSide : 0;
  }
  goto(e, t = -1e9) {
    return this.chunkIndex = this.rangeIndex = 0, this.gotoInner(e, t, !1), this;
  }
  gotoInner(e, t, i) {
    for (; this.chunkIndex < this.layer.chunk.length; ) {
      let r = this.layer.chunk[this.chunkIndex];
      if (!(this.skip && this.skip.has(r) || this.layer.chunkEnd(this.chunkIndex) < e || r.maxPoint < this.minPoint))
        break;
      this.chunkIndex++, i = !1;
    }
    if (this.chunkIndex < this.layer.chunk.length) {
      let r = this.layer.chunk[this.chunkIndex].findIndex(e - this.layer.chunkPos[this.chunkIndex], t, !0);
      (!i || this.rangeIndex < r) && this.setRangeIndex(r);
    }
    this.next();
  }
  forward(e, t) {
    (this.to - e || this.endSide - t) < 0 && this.gotoInner(e, t, !0);
  }
  next() {
    for (; ; )
      if (this.chunkIndex == this.layer.chunk.length) {
        this.from = this.to = 1e9, this.value = null;
        break;
      } else {
        let e = this.layer.chunkPos[this.chunkIndex], t = this.layer.chunk[this.chunkIndex], i = e + t.from[this.rangeIndex];
        if (this.from = i, this.to = e + t.to[this.rangeIndex], this.value = t.value[this.rangeIndex], this.setRangeIndex(this.rangeIndex + 1), this.minPoint < 0 || this.value.point && this.to - this.from >= this.minPoint)
          break;
      }
  }
  setRangeIndex(e) {
    if (e == this.layer.chunk[this.chunkIndex].value.length) {
      if (this.chunkIndex++, this.skip)
        for (; this.chunkIndex < this.layer.chunk.length && this.skip.has(this.layer.chunk[this.chunkIndex]); )
          this.chunkIndex++;
      this.rangeIndex = 0;
    } else
      this.rangeIndex = e;
  }
  nextChunk() {
    this.chunkIndex++, this.rangeIndex = 0, this.next();
  }
  compare(e) {
    return this.from - e.from || this.startSide - e.startSide || this.rank - e.rank || this.to - e.to || this.endSide - e.endSide;
  }
}
class fn {
  constructor(e) {
    this.heap = e;
  }
  static from(e, t = null, i = -1) {
    let r = [];
    for (let s = 0; s < e.length; s++)
      for (let o = e[s]; !o.isEmpty; o = o.nextLayer)
        o.maxPoint >= i && r.push(new dc(o, t, i, s));
    return r.length == 1 ? r[0] : new fn(r);
  }
  get startSide() {
    return this.value ? this.value.startSide : 0;
  }
  goto(e, t = -1e9) {
    for (let i of this.heap)
      i.goto(e, t);
    for (let i = this.heap.length >> 1; i >= 0; i--)
      ks(this.heap, i);
    return this.next(), this;
  }
  forward(e, t) {
    for (let i of this.heap)
      i.forward(e, t);
    for (let i = this.heap.length >> 1; i >= 0; i--)
      ks(this.heap, i);
    (this.to - e || this.value.endSide - t) < 0 && this.next();
  }
  next() {
    if (this.heap.length == 0)
      this.from = this.to = 1e9, this.value = null, this.rank = -1;
    else {
      let e = this.heap[0];
      this.from = e.from, this.to = e.to, this.value = e.value, this.rank = e.rank, e.value && e.next(), ks(this.heap, 0);
    }
  }
}
function ks(n, e) {
  for (let t = n[e]; ; ) {
    let i = (e << 1) + 1;
    if (i >= n.length)
      break;
    let r = n[i];
    if (i + 1 < n.length && r.compare(n[i + 1]) >= 0 && (r = n[i + 1], i++), t.compare(r) < 0)
      break;
    n[i] = t, n[e] = r, e = i;
  }
}
class Ui {
  constructor(e, t, i) {
    this.minPoint = i, this.active = [], this.activeTo = [], this.activeRank = [], this.minActive = -1, this.point = null, this.pointFrom = 0, this.pointRank = 0, this.to = -1e9, this.endSide = 0, this.openStart = -1, this.cursor = fn.from(e, t, i);
  }
  goto(e, t = -1e9) {
    return this.cursor.goto(e, t), this.active.length = this.activeTo.length = this.activeRank.length = 0, this.minActive = -1, this.to = e, this.endSide = t, this.openStart = -1, this.next(), this;
  }
  forward(e, t) {
    for (; this.minActive > -1 && (this.activeTo[this.minActive] - e || this.active[this.minActive].endSide - t) < 0; )
      this.removeActive(this.minActive);
    this.cursor.forward(e, t);
  }
  removeActive(e) {
    En(this.active, e), En(this.activeTo, e), En(this.activeRank, e), this.minActive = Pa(this.active, this.activeTo);
  }
  addActive(e) {
    let t = 0, { value: i, to: r, rank: s } = this.cursor;
    for (; t < this.activeRank.length && (s - this.activeRank[t] || r - this.activeTo[t]) > 0; )
      t++;
    Ln(this.active, t, i), Ln(this.activeTo, t, r), Ln(this.activeRank, t, s), e && Ln(e, t, this.cursor.from), this.minActive = Pa(this.active, this.activeTo);
  }
  // After calling this, if `this.point` != null, the next range is a
  // point. Otherwise, it's a regular range, covered by `this.active`.
  next() {
    let e = this.to, t = this.point;
    this.point = null;
    let i = this.openStart < 0 ? [] : null;
    for (; ; ) {
      let r = this.minActive;
      if (r > -1 && (this.activeTo[r] - this.cursor.from || this.active[r].endSide - this.cursor.startSide) < 0) {
        if (this.activeTo[r] > e) {
          this.to = this.activeTo[r], this.endSide = this.active[r].endSide;
          break;
        }
        this.removeActive(r), i && En(i, r);
      } else if (this.cursor.value)
        if (this.cursor.from > e) {
          this.to = this.cursor.from, this.endSide = this.cursor.startSide;
          break;
        } else {
          let s = this.cursor.value;
          if (!s.point)
            this.addActive(i), this.cursor.next();
          else if (t && this.cursor.to == this.to && this.cursor.from < this.cursor.to)
            this.cursor.next();
          else {
            this.point = s, this.pointFrom = this.cursor.from, this.pointRank = this.cursor.rank, this.to = this.cursor.to, this.endSide = s.endSide, this.cursor.next(), this.forward(this.to, this.endSide);
            break;
          }
        }
      else {
        this.to = this.endSide = 1e9;
        break;
      }
    }
    if (i) {
      this.openStart = 0;
      for (let r = i.length - 1; r >= 0 && i[r] < e; r--)
        this.openStart++;
    }
  }
  activeForPoint(e) {
    if (!this.active.length)
      return this.active;
    let t = [];
    for (let i = this.active.length - 1; i >= 0 && !(this.activeRank[i] < this.pointRank); i--)
      (this.activeTo[i] > e || this.activeTo[i] == e && this.active[i].endSide >= this.point.endSide) && t.push(this.active[i]);
    return t.reverse();
  }
  openEnd(e) {
    let t = 0;
    for (let i = this.activeTo.length - 1; i >= 0 && this.activeTo[i] > e; i--)
      t++;
    return t;
  }
}
function xa(n, e, t, i, r, s) {
  n.goto(e), t.goto(i);
  let o = i + r, l = i, a = i - e, h = !!s.boundChange;
  for (let O = !1; ; ) {
    let c = n.to + a - t.to, f = c || n.endSide - t.endSide, u = f < 0 ? n.to + a : t.to, d = Math.min(u, o);
    if (n.point || t.point ? (n.point && t.point && Ql(n.point, t.point) && Po(n.activeForPoint(n.to), t.activeForPoint(t.to)) || s.comparePoint(l, d, n.point, t.point), O = !1) : (O && (s.boundChange(l), O = !1), d > l && !Po(n.active, t.active) && s.compareRange(l, d, n.active, t.active), h && d < o && (c || n.openEnd(u) != t.openEnd(u)) && (O = !0)), u > o)
      break;
    l = u, f <= 0 && n.next(), f >= 0 && t.next();
  }
}
function Po(n, e) {
  if (n.length != e.length)
    return !1;
  for (let t = 0; t < n.length; t++)
    if (n[t] != e[t] && !Ql(n[t], e[t]))
      return !1;
  return !0;
}
function En(n, e) {
  for (let t = e, i = n.length - 1; t < i; t++)
    n[t] = n[t + 1];
  n.pop();
}
function Ln(n, e, t) {
  for (let i = n.length - 1; i >= e; i--)
    n[i + 1] = n[i];
  n[e] = t;
}
function Pa(n, e) {
  let t = -1, i = 1e9;
  for (let r = 0; r < e.length; r++)
    (e[r] - i || n[r].endSide - n[t].endSide) < 0 && (t = r, i = e[r]);
  return t;
}
function ct(n, e, t = n.length) {
  let i = 0;
  for (let r = 0; r < t && r < n.length; )
    n.charCodeAt(r) == 9 ? (i += e - i % e, r++) : (i++, r = he(n, r));
  return i;
}
function wo(n, e, t, i) {
  for (let r = 0, s = 0; ; ) {
    if (s >= e)
      return r;
    if (r == n.length)
      break;
    s += n.charCodeAt(r) == 9 ? t - s % t : 1, r = he(n, r);
  }
  return i === !0 ? -1 : n.length;
}
const vo = "ͼ", wa = typeof Symbol > "u" ? "__" + vo : Symbol.for(vo), To = typeof Symbol > "u" ? "__styleSet" + Math.floor(Math.random() * 1e8) : Symbol("styleSet"), va = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : {};
class Wt {
  // :: (Object<Style>, ?{finish: ?(string) → string})
  // Create a style module from the given spec.
  //
  // When `finish` is given, it is called on regular (non-`@`)
  // selectors (after `&` expansion) to compute the final selector.
  constructor(e, t) {
    this.rules = [];
    let { finish: i } = t || {};
    function r(o) {
      return /^@/.test(o) ? [o] : o.split(/,\s*/);
    }
    function s(o, l, a, h) {
      let O = [], c = /^@(\w+)\b/.exec(o[0]), f = c && c[1] == "keyframes";
      if (c && l == null) return a.push(o[0] + ";");
      for (let u in l) {
        let d = l[u];
        if (/&/.test(u))
          s(
            u.split(/,\s*/).map((p) => o.map((g) => p.replace(/&/, g))).reduce((p, g) => p.concat(g)),
            d,
            a
          );
        else if (d && typeof d == "object") {
          if (!c) throw new RangeError("The value of a property (" + u + ") should be a primitive value.");
          s(r(u), d, O, f);
        } else d != null && O.push(u.replace(/_.*/, "").replace(/[A-Z]/g, (p) => "-" + p.toLowerCase()) + ": " + d + ";");
      }
      (O.length || f) && a.push((i && !c && !h ? o.map(i) : o).join(", ") + " {" + O.join(" ") + "}");
    }
    for (let o in e) s(r(o), e[o], this.rules);
  }
  // :: () → string
  // Returns a string containing the module's CSS rules.
  getRules() {
    return this.rules.join(`
`);
  }
  // :: () → string
  // Generate a new unique CSS class name.
  static newName() {
    let e = va[wa] || 1;
    return va[wa] = e + 1, vo + e.toString(36);
  }
  // :: (union<Document, ShadowRoot>, union<[StyleModule], StyleModule>, ?{nonce: ?string})
  //
  // Mount the given set of modules in the given DOM root, which ensures
  // that the CSS rules defined by the module are available in that
  // context.
  //
  // Rules are only added to the document once per root.
  //
  // Rule order will follow the order of the modules, so that rules from
  // modules later in the array take precedence of those from earlier
  // modules. If you call this function multiple times for the same root
  // in a way that changes the order of already mounted modules, the old
  // order will be changed.
  //
  // If a Content Security Policy nonce is provided, it is added to
  // the `<style>` tag generated by the library.
  static mount(e, t, i) {
    let r = e[To], s = i && i.nonce;
    r ? s && r.setNonce(s) : r = new zp(e, s), r.mount(Array.isArray(t) ? t : [t], e);
  }
}
let Ta = /* @__PURE__ */ new Map();
class zp {
  constructor(e, t) {
    let i = e.ownerDocument || e, r = i.defaultView;
    if (!e.head && e.adoptedStyleSheets && r.CSSStyleSheet) {
      let s = Ta.get(i);
      if (s) return e[To] = s;
      this.sheet = new r.CSSStyleSheet(), Ta.set(i, this);
    } else
      this.styleTag = i.createElement("style"), t && this.styleTag.setAttribute("nonce", t);
    this.modules = [], e[To] = this;
  }
  mount(e, t) {
    let i = this.sheet, r = 0, s = 0, o = !1;
    for (let l = 0; l < e.length; l++) {
      let a = e[l], h = this.modules.indexOf(a);
      if (h < s && h > -1 && (this.modules.splice(h, 1), o = !0, s--, h = -1), h == -1) {
        if (this.modules.splice(s++, 0, a), o = !0, i) for (let O = 0; O < a.rules.length; O++)
          i.insertRule(a.rules[O], r++);
      } else {
        for (; s < h; ) r += this.modules[s++].rules.length;
        r += a.rules.length, s++;
      }
    }
    if (i)
      t.adoptedStyleSheets.indexOf(this.sheet) < 0 && (t.adoptedStyleSheets = [this.sheet, ...t.adoptedStyleSheets]);
    else {
      if (o) {
        let a = "";
        for (let h = 0; h < this.modules.length; h++)
          a += this.modules[h].getRules() + `
`;
        this.styleTag.textContent = a;
      }
      let l = t.head || t;
      this.styleTag.parentNode != l && l.insertBefore(this.styleTag, l.firstChild);
    }
  }
  setNonce(e) {
    this.styleTag && this.styleTag.getAttribute("nonce") != e && this.styleTag.setAttribute("nonce", e);
  }
}
var zt = {
  8: "Backspace",
  9: "Tab",
  10: "Enter",
  12: "NumLock",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  44: "PrintScreen",
  45: "Insert",
  46: "Delete",
  59: ";",
  61: "=",
  91: "Meta",
  92: "Meta",
  106: "*",
  107: "+",
  108: ",",
  109: "-",
  110: ".",
  111: "/",
  144: "NumLock",
  145: "ScrollLock",
  160: "Shift",
  161: "Shift",
  162: "Control",
  163: "Control",
  164: "Alt",
  165: "Alt",
  173: "-",
  186: ";",
  187: "=",
  188: ",",
  189: "-",
  190: ".",
  191: "/",
  192: "`",
  219: "[",
  220: "\\",
  221: "]",
  222: "'"
}, un = {
  48: ")",
  49: "!",
  50: "@",
  51: "#",
  52: "$",
  53: "%",
  54: "^",
  55: "&",
  56: "*",
  57: "(",
  59: ":",
  61: "+",
  173: "_",
  186: ":",
  187: "+",
  188: "<",
  189: "_",
  190: ">",
  191: "?",
  192: "~",
  219: "{",
  220: "|",
  221: "}",
  222: '"'
}, Mp = typeof navigator < "u" && /Mac/.test(navigator.platform), _p = typeof navigator < "u" && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);
for (var fe = 0; fe < 10; fe++) zt[48 + fe] = zt[96 + fe] = String(fe);
for (var fe = 1; fe <= 24; fe++) zt[fe + 111] = "F" + fe;
for (var fe = 65; fe <= 90; fe++)
  zt[fe] = String.fromCharCode(fe + 32), un[fe] = String.fromCharCode(fe);
for (var $s in zt) un.hasOwnProperty($s) || (un[$s] = zt[$s]);
function Ep(n) {
  var e = Mp && n.metaKey && n.shiftKey && !n.ctrlKey && !n.altKey || _p && n.shiftKey && n.key && n.key.length == 1 || n.key == "Unidentified", t = !e && n.key || (n.shiftKey ? un : zt)[n.keyCode] || n.key || "Unidentified";
  return t == "Esc" && (t = "Escape"), t == "Del" && (t = "Delete"), t == "Left" && (t = "ArrowLeft"), t == "Up" && (t = "ArrowUp"), t == "Right" && (t = "ArrowRight"), t == "Down" && (t = "ArrowDown"), t;
}
function le() {
  var n = arguments[0];
  typeof n == "string" && (n = document.createElement(n));
  var e = 1, t = arguments[1];
  if (t && typeof t == "object" && t.nodeType == null && !Array.isArray(t)) {
    for (var i in t) if (Object.prototype.hasOwnProperty.call(t, i)) {
      var r = t[i];
      typeof r == "string" ? n.setAttribute(i, r) : r != null && (n[i] = r);
    }
    e++;
  }
  for (; e < arguments.length; e++) pc(n, arguments[e]);
  return n;
}
function pc(n, e) {
  if (typeof e == "string")
    n.appendChild(document.createTextNode(e));
  else if (e != null) if (e.nodeType != null)
    n.appendChild(e);
  else if (Array.isArray(e))
    for (var t = 0; t < e.length; t++) pc(n, e[t]);
  else
    throw new RangeError("Unsupported child node: " + e);
}
let be = typeof navigator < "u" ? navigator : { userAgent: "", vendor: "", platform: "" }, Xo = typeof document < "u" ? document : { documentElement: { style: {} } };
const Co = /* @__PURE__ */ /Edge\/(\d+)/.exec(be.userAgent), mc = /* @__PURE__ */ /MSIE \d/.test(be.userAgent), Zo = /* @__PURE__ */ /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(be.userAgent), is = !!(mc || Zo || Co), Xa = !is && /* @__PURE__ */ /gecko\/(\d+)/i.test(be.userAgent), xs = !is && /* @__PURE__ */ /Chrome\/(\d+)/.exec(be.userAgent), Ca = "webkitFontSmoothing" in Xo.documentElement.style, Ro = !is && /* @__PURE__ */ /Apple Computer/.test(be.vendor), Za = Ro && (/* @__PURE__ */ /Mobile\/\w+/.test(be.userAgent) || be.maxTouchPoints > 2);
var v = {
  mac: Za || /* @__PURE__ */ /Mac/.test(be.platform),
  windows: /* @__PURE__ */ /Win/.test(be.platform),
  linux: /* @__PURE__ */ /Linux|X11/.test(be.platform),
  ie: is,
  ie_version: mc ? Xo.documentMode || 6 : Zo ? +Zo[1] : Co ? +Co[1] : 0,
  gecko: Xa,
  gecko_version: Xa ? +(/* @__PURE__ */ /Firefox\/(\d+)/.exec(be.userAgent) || [0, 0])[1] : 0,
  chrome: !!xs,
  chrome_version: xs ? +xs[1] : 0,
  ios: Za,
  android: /* @__PURE__ */ /Android\b/.test(be.userAgent),
  webkit: Ca,
  webkit_version: Ca ? +(/* @__PURE__ */ /\bAppleWebKit\/(\d+)/.exec(be.userAgent) || [0, 0])[1] : 0,
  safari: Ro,
  safari_version: Ro ? +(/* @__PURE__ */ /\bVersion\/(\d+(\.\d+)?)/.exec(be.userAgent) || [0, 0])[1] : 0,
  tabSize: Xo.documentElement.style.tabSize != null ? "tab-size" : "-moz-tab-size"
};
function bl(n, e) {
  for (let t in n)
    t == "class" && e.class ? e.class += " " + n.class : t == "style" && e.style ? e.style += ";" + n.style : e[t] = n[t];
  return e;
}
const xr = /* @__PURE__ */ Object.create(null);
function yl(n, e, t) {
  if (n == e)
    return !0;
  n || (n = xr), e || (e = xr);
  let i = Object.keys(n), r = Object.keys(e);
  if (i.length - 0 != r.length - 0)
    return !1;
  for (let s of i)
    if (s != t && (r.indexOf(s) == -1 || n[s] !== e[s]))
      return !1;
  return !0;
}
function Lp(n, e) {
  for (let t = n.attributes.length - 1; t >= 0; t--) {
    let i = n.attributes[t].name;
    e[i] == null && n.removeAttribute(i);
  }
  for (let t in e) {
    let i = e[t];
    t == "style" ? n.style.cssText = i : n.getAttribute(t) != i && n.setAttribute(t, i);
  }
}
function Ra(n, e, t) {
  let i = !1;
  if (e)
    for (let r in e)
      t && r in t || (i = !0, r == "style" ? n.style.cssText = "" : n.removeAttribute(r));
  if (t)
    for (let r in t)
      e && e[r] == t[r] || (i = !0, r == "style" ? n.style.cssText = t[r] : n.setAttribute(r, t[r]));
  return i;
}
function Yp(n) {
  let e = /* @__PURE__ */ Object.create(null);
  for (let t = 0; t < n.attributes.length; t++) {
    let i = n.attributes[t];
    e[i.name] = i.value;
  }
  return e;
}
class Ut {
  /**
  Compare this instance to another instance of the same type.
  (TypeScript can't express this, but only instances of the same
  specific class will be passed to this method.) This is used to
  avoid redrawing widgets when they are replaced by a new
  decoration of the same type. The default implementation just
  returns `false`, which will cause new instances of the widget to
  always be redrawn.
  */
  eq(e) {
    return !1;
  }
  /**
  Update a DOM element created by a widget of the same type (but
  different, non-`eq` content) to reflect this widget. May return
  true to indicate that it could update, false to indicate it
  couldn't (in which case the widget will be redrawn). The default
  implementation just returns false.
  */
  updateDOM(e, t, i) {
    return !1;
  }
  /**
  @internal
  */
  compare(e) {
    return this == e || this.constructor == e.constructor && this.eq(e);
  }
  /**
  The estimated height this widget will have, to be used when
  estimating the height of content that hasn't been drawn. May
  return -1 to indicate you don't know. The default implementation
  returns -1.
  */
  get estimatedHeight() {
    return -1;
  }
  /**
  For inline widgets that are displayed inline (as opposed to
  `inline-block`) and introduce line breaks (through `<br>` tags
  or textual newlines), this must indicate the amount of line
  breaks they introduce. Defaults to 0.
  */
  get lineBreaks() {
    return 0;
  }
  /**
  Can be used to configure which kinds of events inside the widget
  should be ignored by the editor. The default is to ignore all
  events.
  */
  ignoreEvent(e) {
    return !0;
  }
  /**
  Override the way screen coordinates for positions at/in the
  widget are found. `pos` will be the offset into the widget, and
  `side` the side of the position that is being queried—less than
  zero for before, greater than zero for after, and zero for
  directly at that position.
  */
  coordsAt(e, t, i) {
    return null;
  }
  /**
  @internal
  */
  get isHidden() {
    return !1;
  }
  /**
  @internal
  */
  get editable() {
    return !1;
  }
  /**
  This is called when the an instance of the widget is removed
  from the editor view.
  */
  destroy(e) {
  }
}
var ue = /* @__PURE__ */ function(n) {
  return n[n.Text = 0] = "Text", n[n.WidgetBefore = 1] = "WidgetBefore", n[n.WidgetAfter = 2] = "WidgetAfter", n[n.WidgetRange = 3] = "WidgetRange", n;
}(ue || (ue = {}));
class A extends jt {
  constructor(e, t, i, r) {
    super(), this.startSide = e, this.endSide = t, this.widget = i, this.spec = r;
  }
  /**
  @internal
  */
  get heightRelevant() {
    return !1;
  }
  /**
  Create a mark decoration, which influences the styling of the
  content in its range. Nested mark decorations will cause nested
  DOM elements to be created. Nesting order is determined by
  precedence of the [facet](https://codemirror.net/6/docs/ref/#view.EditorView^decorations), with
  the higher-precedence decorations creating the inner DOM nodes.
  Such elements are split on line boundaries and on the boundaries
  of lower-precedence decorations.
  */
  static mark(e) {
    return new Cn(e);
  }
  /**
  Create a widget decoration, which displays a DOM element at the
  given position.
  */
  static widget(e) {
    let t = Math.max(-1e4, Math.min(1e4, e.side || 0)), i = !!e.block;
    return t += i && !e.inlineOrder ? t > 0 ? 3e8 : -4e8 : t > 0 ? 1e8 : -1e8, new ri(e, t, t, i, e.widget || null, !1);
  }
  /**
  Create a replace decoration which replaces the given range with
  a widget, or simply hides it.
  */
  static replace(e) {
    let t = !!e.block, i, r;
    if (e.isBlockGap)
      i = -5e8, r = 4e8;
    else {
      let { start: s, end: o } = gc(e, t);
      i = (s ? t ? -3e8 : -1 : 5e8) - 1, r = (o ? t ? 2e8 : 1 : -6e8) + 1;
    }
    return new ri(e, i, r, t, e.widget || null, !0);
  }
  /**
  Create a line decoration, which can add DOM attributes to the
  line starting at the given position.
  */
  static line(e) {
    return new Zn(e);
  }
  /**
  Build a [`DecorationSet`](https://codemirror.net/6/docs/ref/#view.DecorationSet) from the given
  decorated range or ranges. If the ranges aren't already sorted,
  pass `true` for `sort` to make the library sort them for you.
  */
  static set(e, t = !1) {
    return _.of(e, t);
  }
  /**
  @internal
  */
  hasHeight() {
    return this.widget ? this.widget.estimatedHeight > -1 : !1;
  }
}
A.none = _.empty;
class Cn extends A {
  constructor(e) {
    let { start: t, end: i } = gc(e);
    super(t ? -1 : 5e8, i ? 1 : -6e8, null, e), this.tagName = e.tagName || "span", this.attrs = e.class && e.attributes ? bl(e.attributes, { class: e.class }) : e.class ? { class: e.class } : e.attributes || xr;
  }
  eq(e) {
    return this == e || e instanceof Cn && this.tagName == e.tagName && yl(this.attrs, e.attrs);
  }
  range(e, t = e) {
    if (e >= t)
      throw new RangeError("Mark decorations may not be empty");
    return super.range(e, t);
  }
}
Cn.prototype.point = !1;
class Zn extends A {
  constructor(e) {
    super(-2e8, -2e8, null, e);
  }
  eq(e) {
    return e instanceof Zn && this.spec.class == e.spec.class && yl(this.spec.attributes, e.spec.attributes);
  }
  range(e, t = e) {
    if (t != e)
      throw new RangeError("Line decoration ranges must be zero-length");
    return super.range(e, t);
  }
}
Zn.prototype.mapMode = me.TrackBefore;
Zn.prototype.point = !0;
class ri extends A {
  constructor(e, t, i, r, s, o) {
    super(t, i, s, e), this.block = r, this.isReplace = o, this.mapMode = r ? t <= 0 ? me.TrackBefore : me.TrackAfter : me.TrackDel;
  }
  // Only relevant when this.block == true
  get type() {
    return this.startSide != this.endSide ? ue.WidgetRange : this.startSide <= 0 ? ue.WidgetBefore : ue.WidgetAfter;
  }
  get heightRelevant() {
    return this.block || !!this.widget && (this.widget.estimatedHeight >= 5 || this.widget.lineBreaks > 0);
  }
  eq(e) {
    return e instanceof ri && Vp(this.widget, e.widget) && this.block == e.block && this.startSide == e.startSide && this.endSide == e.endSide;
  }
  range(e, t = e) {
    if (this.isReplace && (e > t || e == t && this.startSide > 0 && this.endSide <= 0))
      throw new RangeError("Invalid range for replacement decoration");
    if (!this.isReplace && t != e)
      throw new RangeError("Widget decorations can only have zero-length ranges");
    return super.range(e, t);
  }
}
ri.prototype.point = !0;
function gc(n, e = !1) {
  let { inclusiveStart: t, inclusiveEnd: i } = n;
  return t == null && (t = n.inclusive), i == null && (i = n.inclusive), { start: t ?? e, end: i ?? e };
}
function Vp(n, e) {
  return n == e || !!(n && e && n.compare(e));
}
function ki(n, e, t, i = 0) {
  let r = t.length - 1;
  r >= 0 && t[r] + i >= n ? t[r] = Math.max(t[r], e) : t.push(n, e);
}
class dn extends jt {
  constructor(e, t, i) {
    super(), this.tagName = e, this.attributes = t, this.rank = i;
  }
  eq(e) {
    return e == this || e instanceof dn && this.tagName == e.tagName && yl(this.attributes, e.attributes);
  }
  /**
  Create a block wrapper object with the given tag name and
  attributes.
  */
  static create(e) {
    return new dn(e.tagName, e.attributes || xr, e.rank == null ? 50 : Math.max(0, Math.min(e.rank, 100)));
  }
  /**
  Create a range set from the given block wrapper ranges.
  */
  static set(e, t = !1) {
    return _.of(e, t);
  }
}
dn.prototype.startSide = dn.prototype.endSide = -1;
function pn(n) {
  let e;
  return n.nodeType == 11 ? e = n.getSelection ? n : n.ownerDocument : e = n, e.getSelection();
}
function Ao(n, e) {
  return e ? n == e || n.contains(e.nodeType != 1 ? e.parentNode : e) : !1;
}
function rn(n, e) {
  if (!e.anchorNode)
    return !1;
  try {
    return Ao(n, e.anchorNode);
  } catch {
    return !1;
  }
}
function sn(n) {
  return n.nodeType == 3 ? gn(n, 0, n.nodeValue.length).getClientRects() : n.nodeType == 1 ? n.getClientRects() : [];
}
function on(n, e, t, i) {
  return t ? Aa(n, e, t, i, -1) || Aa(n, e, t, i, 1) : !1;
}
function Mt(n) {
  for (var e = 0; ; e++)
    if (n = n.previousSibling, !n)
      return e;
}
function Pr(n) {
  return n.nodeType == 1 && /^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(n.nodeName);
}
function Aa(n, e, t, i, r) {
  for (; ; ) {
    if (n == t && e == i)
      return !0;
    if (e == (r < 0 ? 0 : kt(n))) {
      if (n.nodeName == "DIV")
        return !1;
      let s = n.parentNode;
      if (!s || s.nodeType != 1)
        return !1;
      e = Mt(n) + (r < 0 ? 0 : 1), n = s;
    } else if (n.nodeType == 1) {
      if (n = n.childNodes[e + (r < 0 ? -1 : 0)], n.nodeType == 1 && n.contentEditable == "false")
        return !1;
      e = r < 0 ? kt(n) : 0;
    } else
      return !1;
  }
}
function kt(n) {
  return n.nodeType == 3 ? n.nodeValue.length : n.childNodes.length;
}
function mn(n, e) {
  let { left: t, right: i } = n;
  if (t == i)
    return n;
  let r = e ? t : i;
  return { left: r, right: r, top: n.top, bottom: n.bottom };
}
function Up(n) {
  let e = n.visualViewport;
  return e ? {
    left: 0,
    right: e.width,
    top: 0,
    bottom: e.height
  } : {
    left: 0,
    right: n.innerWidth,
    top: 0,
    bottom: n.innerHeight
  };
}
function Qc(n, e) {
  let t = e.width / n.offsetWidth, i = e.height / n.offsetHeight;
  return (t > 0.995 && t < 1.005 || !isFinite(t) || Math.abs(e.width - n.offsetWidth) < 1) && (t = 1), (i > 0.995 && i < 1.005 || !isFinite(i) || Math.abs(e.height - n.offsetHeight) < 1) && (i = 1), { scaleX: t, scaleY: i };
}
function Dp(n, e, t, i, r, s, o, l) {
  let a = n.ownerDocument, h = a.defaultView || window;
  for (let O = n, c = !1; O && !c; )
    if (O.nodeType == 1) {
      let f, u = O == a.body, d = 1, p = 1;
      if (u)
        f = Up(h);
      else {
        if (/^(fixed|sticky)$/.test(getComputedStyle(O).position) && (c = !0), O.scrollHeight <= O.clientHeight && O.scrollWidth <= O.clientWidth) {
          O = O.assignedSlot || O.parentNode;
          continue;
        }
        let b = O.getBoundingClientRect();
        ({ scaleX: d, scaleY: p } = Qc(O, b)), f = {
          left: b.left,
          right: b.left + O.clientWidth * d,
          top: b.top,
          bottom: b.top + O.clientHeight * p
        };
      }
      let g = 0, Q = 0;
      if (r == "nearest")
        e.top < f.top + o ? (Q = e.top - (f.top + o), t > 0 && e.bottom > f.bottom + Q && (Q = e.bottom - f.bottom + o)) : e.bottom > f.bottom - o && (Q = e.bottom - f.bottom + o, t < 0 && e.top - Q < f.top && (Q = e.top - (f.top + o)));
      else {
        let b = e.bottom - e.top, y = f.bottom - f.top;
        Q = (r == "center" && b <= y ? e.top + b / 2 - y / 2 : r == "start" || r == "center" && t < 0 ? e.top - o : e.bottom - y + o) - f.top;
      }
      if (i == "nearest" ? e.left < f.left + s ? (g = e.left - (f.left + s), t > 0 && e.right > f.right + g && (g = e.right - f.right + s)) : e.right > f.right - s && (g = e.right - f.right + s, t < 0 && e.left < f.left + g && (g = e.left - (f.left + s))) : g = (i == "center" ? e.left + (e.right - e.left) / 2 - (f.right - f.left) / 2 : i == "start" == l ? e.left - s : e.right - (f.right - f.left) + s) - f.left, g || Q)
        if (u)
          h.scrollBy(g, Q);
        else {
          let b = 0, y = 0;
          if (Q) {
            let C = O.scrollTop;
            O.scrollTop += Q / p, y = (O.scrollTop - C) * p;
          }
          if (g) {
            let C = O.scrollLeft;
            O.scrollLeft += g / d, b = (O.scrollLeft - C) * d;
          }
          e = {
            left: e.left - b,
            top: e.top - y,
            right: e.right - b,
            bottom: e.bottom - y
          }, b && Math.abs(b - g) < 1 && (i = "nearest"), y && Math.abs(y - Q) < 1 && (r = "nearest");
        }
      if (u)
        break;
      (e.top < f.top || e.bottom > f.bottom || e.left < f.left || e.right > f.right) && (e = {
        left: Math.max(e.left, f.left),
        right: Math.min(e.right, f.right),
        top: Math.max(e.top, f.top),
        bottom: Math.min(e.bottom, f.bottom)
      }), O = O.assignedSlot || O.parentNode;
    } else if (O.nodeType == 11)
      O = O.host;
    else
      break;
}
function Sc(n, e = !0) {
  let t = n.ownerDocument, i = null, r = null;
  for (let s = n.parentNode; s && !(s == t.body || (!e || i) && r); )
    if (s.nodeType == 1)
      !r && s.scrollHeight > s.clientHeight && (r = s), e && !i && s.scrollWidth > s.clientWidth && (i = s), s = s.assignedSlot || s.parentNode;
    else if (s.nodeType == 11)
      s = s.host;
    else
      break;
  return { x: i, y: r };
}
class Bp {
  constructor() {
    this.anchorNode = null, this.anchorOffset = 0, this.focusNode = null, this.focusOffset = 0;
  }
  eq(e) {
    return this.anchorNode == e.anchorNode && this.anchorOffset == e.anchorOffset && this.focusNode == e.focusNode && this.focusOffset == e.focusOffset;
  }
  setRange(e) {
    let { anchorNode: t, focusNode: i } = e;
    this.set(t, Math.min(e.anchorOffset, t ? kt(t) : 0), i, Math.min(e.focusOffset, i ? kt(i) : 0));
  }
  set(e, t, i, r) {
    this.anchorNode = e, this.anchorOffset = t, this.focusNode = i, this.focusOffset = r;
  }
}
function bc(n) {
  let e = [];
  for (let t = n; t; t = t.nodeType == 11 ? t.host : t.parentNode)
    t.nodeType == 1 && e.push({ node: t, left: t.scrollLeft, top: t.scrollTop });
  return e;
}
function yc(n, e = !0) {
  for (let { node: t, left: i, top: r } of n)
    e && t.scrollTop != r && (t.scrollTop = r), t.scrollLeft != i && (t.scrollLeft = i);
}
let Ht = null;
v.safari && v.safari_version >= 26 && (Ht = !1);
function kc(n) {
  if (n.setActive)
    return n.setActive();
  if (Ht)
    return n.focus(Ht);
  let e = bc(n);
  n.focus(Ht == null ? {
    get preventScroll() {
      return Ht = { preventScroll: !0 }, !0;
    }
  } : void 0), Ht || (Ht = !1, yc(e));
}
let qa;
function gn(n, e, t = e) {
  let i = qa || (qa = document.createRange());
  return i.setEnd(n, t), i.setStart(n, e), i;
}
function $i(n, e, t, i) {
  let r = { key: e, code: e, keyCode: t, which: t, cancelable: !0 };
  i && ({ altKey: r.altKey, ctrlKey: r.ctrlKey, shiftKey: r.shiftKey, metaKey: r.metaKey } = i);
  let s = new KeyboardEvent("keydown", r);
  s.synthetic = !0, n.dispatchEvent(s);
  let o = new KeyboardEvent("keyup", r);
  return o.synthetic = !0, n.dispatchEvent(o), s.defaultPrevented || o.defaultPrevented;
}
function Ip(n) {
  for (; n; ) {
    if (n && (n.nodeType == 9 || n.nodeType == 11 && n.host))
      return n;
    n = n.assignedSlot || n.parentNode;
  }
  return null;
}
function Gp(n, e) {
  let t = e.focusNode, i = e.focusOffset;
  if (!t || e.anchorNode != t || e.anchorOffset != i)
    return !1;
  for (i = Math.min(i, kt(t)); ; )
    if (i) {
      if (t.nodeType != 1)
        return !1;
      let r = t.childNodes[i - 1];
      r.contentEditable == "false" ? i-- : (t = r, i = kt(t));
    } else {
      if (t == n)
        return !0;
      i = Mt(t), t = t.parentNode;
    }
}
function $c(n) {
  return n instanceof Window ? n.pageYOffset > Math.max(0, n.document.documentElement.scrollHeight - n.innerHeight - 4) : n.scrollTop > Math.max(1, n.scrollHeight - n.clientHeight - 4);
}
function xc(n, e) {
  for (let t = n, i = e; ; ) {
    if (t.nodeType == 3 && i > 0)
      return { node: t, offset: i };
    if (t.nodeType == 1 && i > 0) {
      if (t.contentEditable == "false")
        return null;
      t = t.childNodes[i - 1], i = kt(t);
    } else if (t.parentNode && !Pr(t))
      i = Mt(t), t = t.parentNode;
    else
      return null;
  }
}
function Pc(n, e) {
  for (let t = n, i = e; ; ) {
    if (t.nodeType == 3 && i < t.nodeValue.length)
      return { node: t, offset: i };
    if (t.nodeType == 1 && i < t.childNodes.length) {
      if (t.contentEditable == "false")
        return null;
      t = t.childNodes[i], i = 0;
    } else if (t.parentNode && !Pr(t))
      i = Mt(t) + 1, t = t.parentNode;
    else
      return null;
  }
}
class Be {
  constructor(e, t, i = !0) {
    this.node = e, this.offset = t, this.precise = i;
  }
  static before(e, t) {
    return new Be(e.parentNode, Mt(e), t);
  }
  static after(e, t) {
    return new Be(e.parentNode, Mt(e) + 1, t);
  }
}
var K = /* @__PURE__ */ function(n) {
  return n[n.LTR = 0] = "LTR", n[n.RTL = 1] = "RTL", n;
}(K || (K = {}));
const si = K.LTR, kl = K.RTL;
function wc(n) {
  let e = [];
  for (let t = 0; t < n.length; t++)
    e.push(1 << +n[t]);
  return e;
}
const Np = /* @__PURE__ */ wc("88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008"), Fp = /* @__PURE__ */ wc("4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333"), qo = /* @__PURE__ */ Object.create(null), Ke = [];
for (let n of ["()", "[]", "{}"]) {
  let e = /* @__PURE__ */ n.charCodeAt(0), t = /* @__PURE__ */ n.charCodeAt(1);
  qo[e] = t, qo[t] = -e;
}
function vc(n) {
  return n <= 247 ? Np[n] : 1424 <= n && n <= 1524 ? 2 : 1536 <= n && n <= 1785 ? Fp[n - 1536] : 1774 <= n && n <= 2220 ? 4 : 8192 <= n && n <= 8204 ? 256 : 64336 <= n && n <= 65023 ? 4 : 1;
}
const Hp = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac\ufb50-\ufdff]/;
class st {
  /**
  The direction of this span.
  */
  get dir() {
    return this.level % 2 ? kl : si;
  }
  /**
  @internal
  */
  constructor(e, t, i) {
    this.from = e, this.to = t, this.level = i;
  }
  /**
  @internal
  */
  side(e, t) {
    return this.dir == t == e ? this.to : this.from;
  }
  /**
  @internal
  */
  forward(e, t) {
    return e == (this.dir == t);
  }
  /**
  @internal
  */
  static find(e, t, i, r) {
    let s = -1;
    for (let o = 0; o < e.length; o++) {
      let l = e[o];
      if (l.from <= t && l.to >= t) {
        if (l.level == i)
          return o;
        (s < 0 || (r != 0 ? r < 0 ? l.from < t : l.to > t : e[s].level > l.level)) && (s = o);
      }
    }
    if (s < 0)
      throw new RangeError("Index out of range");
    return s;
  }
}
function Tc(n, e) {
  if (n.length != e.length)
    return !1;
  for (let t = 0; t < n.length; t++) {
    let i = n[t], r = e[t];
    if (i.from != r.from || i.to != r.to || i.direction != r.direction || !Tc(i.inner, r.inner))
      return !1;
  }
  return !0;
}
const N = [];
function Kp(n, e, t, i, r) {
  for (let s = 0; s <= i.length; s++) {
    let o = s ? i[s - 1].to : e, l = s < i.length ? i[s].from : t, a = s ? 256 : r;
    for (let h = o, O = a, c = a; h < l; h++) {
      let f = vc(n.charCodeAt(h));
      f == 512 ? f = O : f == 8 && c == 4 && (f = 16), N[h] = f == 4 ? 2 : f, f & 7 && (c = f), O = f;
    }
    for (let h = o, O = a, c = a; h < l; h++) {
      let f = N[h];
      if (f == 128)
        h < l - 1 && O == N[h + 1] && O & 24 ? f = N[h] = O : N[h] = 256;
      else if (f == 64) {
        let u = h + 1;
        for (; u < l && N[u] == 64; )
          u++;
        let d = h && O == 8 || u < t && N[u] == 8 ? c == 1 ? 1 : 8 : 256;
        for (let p = h; p < u; p++)
          N[p] = d;
        h = u - 1;
      } else f == 8 && c == 1 && (N[h] = 1);
      O = f, f & 7 && (c = f);
    }
  }
}
function Jp(n, e, t, i, r) {
  let s = r == 1 ? 2 : 1;
  for (let o = 0, l = 0, a = 0; o <= i.length; o++) {
    let h = o ? i[o - 1].to : e, O = o < i.length ? i[o].from : t;
    for (let c = h, f, u, d; c < O; c++)
      if (u = qo[f = n.charCodeAt(c)])
        if (u < 0) {
          for (let p = l - 3; p >= 0; p -= 3)
            if (Ke[p + 1] == -u) {
              let g = Ke[p + 2], Q = g & 2 ? r : g & 4 ? g & 1 ? s : r : 0;
              Q && (N[c] = N[Ke[p]] = Q), l = p;
              break;
            }
        } else {
          if (Ke.length == 189)
            break;
          Ke[l++] = c, Ke[l++] = f, Ke[l++] = a;
        }
      else if ((d = N[c]) == 2 || d == 1) {
        let p = d == r;
        a = p ? 0 : 1;
        for (let g = l - 3; g >= 0; g -= 3) {
          let Q = Ke[g + 2];
          if (Q & 2)
            break;
          if (p)
            Ke[g + 2] |= 2;
          else {
            if (Q & 4)
              break;
            Ke[g + 2] |= 4;
          }
        }
      }
  }
}
function em(n, e, t, i) {
  for (let r = 0, s = i; r <= t.length; r++) {
    let o = r ? t[r - 1].to : n, l = r < t.length ? t[r].from : e;
    for (let a = o; a < l; ) {
      let h = N[a];
      if (h == 256) {
        let O = a + 1;
        for (; ; )
          if (O == l) {
            if (r == t.length)
              break;
            O = t[r++].to, l = r < t.length ? t[r].from : e;
          } else if (N[O] == 256)
            O++;
          else
            break;
        let c = s == 1, f = (O < e ? N[O] : i) == 1, u = c == f ? c ? 1 : 2 : i;
        for (let d = O, p = r, g = p ? t[p - 1].to : n; d > a; )
          d == g && (d = t[--p].from, g = p ? t[p - 1].to : n), N[--d] = u;
        a = O;
      } else
        s = h, a++;
    }
  }
}
function jo(n, e, t, i, r, s, o) {
  let l = i % 2 ? 2 : 1;
  if (i % 2 == r % 2)
    for (let a = e, h = 0; a < t; ) {
      let O = !0, c = !1;
      if (h == s.length || a < s[h].from) {
        let p = N[a];
        p != l && (O = !1, c = p == 16);
      }
      let f = !O && l == 1 ? [] : null, u = O ? i : i + 1, d = a;
      e: for (; ; )
        if (h < s.length && d == s[h].from) {
          if (c)
            break e;
          let p = s[h];
          if (!O)
            for (let g = p.to, Q = h + 1; ; ) {
              if (g == t)
                break e;
              if (Q < s.length && s[Q].from == g)
                g = s[Q++].to;
              else {
                if (N[g] == l)
                  break e;
                break;
              }
            }
          if (h++, f)
            f.push(p);
          else {
            p.from > a && o.push(new st(a, p.from, u));
            let g = p.direction == si != !(u % 2);
            Wo(n, g ? i + 1 : i, r, p.inner, p.from, p.to, o), a = p.to;
          }
          d = p.to;
        } else {
          if (d == t || (O ? N[d] != l : N[d] == l))
            break;
          d++;
        }
      f ? jo(n, a, d, i + 1, r, f, o) : a < d && o.push(new st(a, d, u)), a = d;
    }
  else
    for (let a = t, h = s.length; a > e; ) {
      let O = !0, c = !1;
      if (!h || a > s[h - 1].to) {
        let p = N[a - 1];
        p != l && (O = !1, c = p == 16);
      }
      let f = !O && l == 1 ? [] : null, u = O ? i : i + 1, d = a;
      e: for (; ; )
        if (h && d == s[h - 1].to) {
          if (c)
            break e;
          let p = s[--h];
          if (!O)
            for (let g = p.from, Q = h; ; ) {
              if (g == e)
                break e;
              if (Q && s[Q - 1].to == g)
                g = s[--Q].from;
              else {
                if (N[g - 1] == l)
                  break e;
                break;
              }
            }
          if (f)
            f.push(p);
          else {
            p.to < a && o.push(new st(p.to, a, u));
            let g = p.direction == si != !(u % 2);
            Wo(n, g ? i + 1 : i, r, p.inner, p.from, p.to, o), a = p.from;
          }
          d = p.from;
        } else {
          if (d == e || (O ? N[d - 1] != l : N[d - 1] == l))
            break;
          d--;
        }
      f ? jo(n, d, a, i + 1, r, f, o) : d < a && o.push(new st(d, a, u)), a = d;
    }
}
function Wo(n, e, t, i, r, s, o) {
  let l = e % 2 ? 2 : 1;
  Kp(n, r, s, i, l), Jp(n, r, s, i, l), em(r, s, i, l), jo(n, r, s, e, t, i, o);
}
function tm(n, e, t) {
  if (!n)
    return [new st(0, 0, e == kl ? 1 : 0)];
  if (e == si && !t.length && !Hp.test(n))
    return Xc(n.length);
  if (t.length)
    for (; n.length > N.length; )
      N[N.length] = 256;
  let i = [], r = e == si ? 0 : 1;
  return Wo(n, r, r, t, 0, n.length, i), i;
}
function Xc(n) {
  return [new st(0, n, 0)];
}
let Cc = "";
function im(n, e, t, i, r) {
  var s;
  if (!n.length)
    return null;
  let o = i.head - n.from, l;
  if (i.head == n.from && i.assoc < 0) {
    if (!r)
      return null;
    o = e[l = 0].side(!1, t);
  } else if (i.head == n.to && i.assoc > 0) {
    if (r)
      return null;
    o = e[l = e.length - 1].side(!0, t);
  } else
    l = st.find(e, o, (s = i.bidiLevel) !== null && s !== void 0 ? s : -1, i.assoc);
  let a = e[l], h = a.side(r, t);
  if (o == h) {
    let f = l += r ? 1 : -1;
    if (f < 0 || f >= e.length)
      return null;
    a = e[l = f], o = a.side(!r, t), h = a.side(r, t);
  }
  let O = he(n.text, o, a.forward(r, t));
  (O < a.from || O > a.to) && (O = h), Cc = n.text.slice(Math.min(o, O), Math.max(o, O));
  let c = l == (r ? e.length - 1 : 0) ? null : e[l + (r ? 1 : -1)];
  if (O == h) {
    if (!c)
      return r ? S.cursor(n.to, 1) : S.cursor(n.from, -1);
    if (c.level + (r ? 0 : 1) < a.level)
      return S.cursor(c.side(!r, t) + n.from, c.forward(r, t) ? 1 : -1, c.level);
  }
  return S.cursor(O + n.from, a.forward(r, t) ? -1 : 1, a.level);
}
function nm(n, e, t) {
  for (let i = e; i < t; i++) {
    let r = vc(n.charCodeAt(i));
    if (r == 1)
      return si;
    if (r == 2 || r == 4)
      return kl;
  }
  return si;
}
const Zc = /* @__PURE__ */ X.define(), Rc = /* @__PURE__ */ X.define(), Ac = /* @__PURE__ */ X.define(), qc = /* @__PURE__ */ X.define(), zo = /* @__PURE__ */ X.define(), jc = /* @__PURE__ */ X.define(), Wc = /* @__PURE__ */ X.define(), $l = /* @__PURE__ */ X.define(), xl = /* @__PURE__ */ X.define(), zc = /* @__PURE__ */ X.define({
  combine: (n) => n.some((e) => e)
}), Mc = /* @__PURE__ */ X.define({
  combine: (n) => n.some((e) => e)
}), _c = /* @__PURE__ */ X.define();
class xi {
  constructor(e, t, i, r, s, o = !1) {
    this.range = e, this.y = t, this.x = i, this.yMargin = r, this.xMargin = s, this.isSnapshot = o;
  }
  map(e) {
    return e.empty ? this : new xi(this.range.map(e), this.y, this.x, this.yMargin, this.xMargin, this.isSnapshot);
  }
  clip(e) {
    return this.range.to <= e.doc.length ? this : new xi(S.cursor(e.doc.length), this.y, this.x, this.yMargin, this.xMargin, this.isSnapshot);
  }
}
const Yn = /* @__PURE__ */ W.define({ map: (n, e) => n.map(e) }), Ec = /* @__PURE__ */ W.define();
function je(n, e, t) {
  let i = n.facet(qc);
  i.length ? i[0](e) : window.onerror && window.onerror(String(e), t, void 0, void 0, e) || (t ? console.error(t + ":", e) : console.error(e));
}
const St = /* @__PURE__ */ X.define({ combine: (n) => n.length ? n[0] : !0 });
let rm = 0;
const Qi = /* @__PURE__ */ X.define({
  combine(n) {
    return n.filter((e, t) => {
      for (let i = 0; i < t; i++)
        if (n[i].plugin == e.plugin)
          return !1;
      return !0;
    });
  }
});
class re {
  constructor(e, t, i, r, s) {
    this.id = e, this.create = t, this.domEventHandlers = i, this.domEventObservers = r, this.baseExtensions = s(this), this.extension = this.baseExtensions.concat(Qi.of({ plugin: this, arg: void 0 }));
  }
  /**
  Create an extension for this plugin with the given argument.
  */
  of(e) {
    return this.baseExtensions.concat(Qi.of({ plugin: this, arg: e }));
  }
  /**
  Define a plugin from a constructor function that creates the
  plugin's value, given an editor view.
  */
  static define(e, t) {
    const { eventHandlers: i, eventObservers: r, provide: s, decorations: o } = t || {};
    return new re(rm++, e, i, r, (l) => {
      let a = [];
      return o && a.push(ns.of((h) => {
        let O = h.plugin(l);
        return O ? o(O) : A.none;
      })), s && a.push(s(l)), a;
    });
  }
  /**
  Create a plugin for a class whose constructor takes a single
  editor view as argument.
  */
  static fromClass(e, t) {
    return re.define((i, r) => new e(i, r), t);
  }
}
class Ps {
  constructor(e) {
    this.spec = e, this.mustUpdate = null, this.value = null;
  }
  get plugin() {
    return this.spec && this.spec.plugin;
  }
  update(e) {
    if (this.value) {
      if (this.mustUpdate) {
        let t = this.mustUpdate;
        if (this.mustUpdate = null, this.value.update)
          try {
            this.value.update(t);
          } catch (i) {
            if (je(t.state, i, "CodeMirror plugin crashed"), this.value.destroy)
              try {
                this.value.destroy();
              } catch {
              }
            this.deactivate();
          }
      }
    } else if (this.spec)
      try {
        this.value = this.spec.plugin.create(e, this.spec.arg);
      } catch (t) {
        je(e.state, t, "CodeMirror plugin crashed"), this.deactivate();
      }
    return this;
  }
  destroy(e) {
    var t;
    if (!((t = this.value) === null || t === void 0) && t.destroy)
      try {
        this.value.destroy();
      } catch (i) {
        je(e.state, i, "CodeMirror plugin crashed");
      }
  }
  deactivate() {
    this.spec = this.value = null;
  }
}
const Lc = /* @__PURE__ */ X.define(), Pl = /* @__PURE__ */ X.define(), ns = /* @__PURE__ */ X.define(), Yc = /* @__PURE__ */ X.define(), wl = /* @__PURE__ */ X.define(), Rn = /* @__PURE__ */ X.define(), Vc = /* @__PURE__ */ X.define();
function ja(n, e) {
  let t = n.state.facet(Vc);
  if (!t.length)
    return t;
  let i = t.map((s) => s instanceof Function ? s(n) : s), r = [];
  return _.spans(i, e.from, e.to, {
    point() {
    },
    span(s, o, l, a) {
      let h = s - e.from, O = o - e.from, c = r;
      for (let f = l.length - 1; f >= 0; f--, a--) {
        let u = l[f].spec.bidiIsolate, d;
        if (u == null && (u = nm(e.text, h, O)), a > 0 && c.length && (d = c[c.length - 1]).to == h && d.direction == u)
          d.to = O, c = d.inner;
        else {
          let p = { from: h, to: O, direction: u, inner: [] };
          c.push(p), c = p.inner;
        }
      }
    }
  }), r;
}
const Uc = /* @__PURE__ */ X.define();
function vl(n) {
  let e = 0, t = 0, i = 0, r = 0;
  for (let s of n.state.facet(Uc)) {
    let o = s(n);
    o && (o.left != null && (e = Math.max(e, o.left)), o.right != null && (t = Math.max(t, o.right)), o.top != null && (i = Math.max(i, o.top)), o.bottom != null && (r = Math.max(r, o.bottom)));
  }
  return { left: e, right: t, top: i, bottom: r };
}
const Hi = /* @__PURE__ */ X.define();
class _e {
  constructor(e, t, i, r) {
    this.fromA = e, this.toA = t, this.fromB = i, this.toB = r;
  }
  join(e) {
    return new _e(Math.min(this.fromA, e.fromA), Math.max(this.toA, e.toA), Math.min(this.fromB, e.fromB), Math.max(this.toB, e.toB));
  }
  addToSet(e) {
    let t = e.length, i = this;
    for (; t > 0; t--) {
      let r = e[t - 1];
      if (!(r.fromA > i.toA)) {
        if (r.toA < i.fromA)
          break;
        i = i.join(r), e.splice(t - 1, 1);
      }
    }
    return e.splice(t, 0, i), e;
  }
  // Extend a set to cover all the content in `ranges`, which is a
  // flat array with each pair of numbers representing fromB/toB
  // positions. These pairs are generated in unchanged ranges, so the
  // offset between doc A and doc B is the same for their start and
  // end points.
  static extendWithRanges(e, t) {
    if (t.length == 0)
      return e;
    let i = [];
    for (let r = 0, s = 0, o = 0; ; ) {
      let l = r < e.length ? e[r].fromB : 1e9, a = s < t.length ? t[s] : 1e9, h = Math.min(l, a);
      if (h == 1e9)
        break;
      let O = h + o, c = h, f = O;
      for (; ; )
        if (s < t.length && t[s] <= c) {
          let u = t[s + 1];
          s += 2, c = Math.max(c, u);
          for (let d = r; d < e.length && e[d].fromB <= c; d++)
            o = e[d].toA - e[d].toB;
          f = Math.max(f, u + o);
        } else if (r < e.length && e[r].fromB <= c) {
          let u = e[r++];
          c = Math.max(c, u.toB), f = Math.max(f, u.toA), o = u.toA - u.toB;
        } else
          break;
      i.push(new _e(O, f, h, c));
    }
    return i;
  }
}
class wr {
  constructor(e, t, i) {
    this.view = e, this.state = t, this.transactions = i, this.flags = 0, this.startState = e.state, this.changes = oe.empty(this.startState.doc.length);
    for (let s of i)
      this.changes = this.changes.compose(s.changes);
    let r = [];
    this.changes.iterChangedRanges((s, o, l, a) => r.push(new _e(s, o, l, a))), this.changedRanges = r;
  }
  /**
  @internal
  */
  static create(e, t, i) {
    return new wr(e, t, i);
  }
  /**
  Tells you whether the [viewport](https://codemirror.net/6/docs/ref/#view.EditorView.viewport) or
  [visible ranges](https://codemirror.net/6/docs/ref/#view.EditorView.visibleRanges) changed in this
  update.
  */
  get viewportChanged() {
    return (this.flags & 4) > 0;
  }
  /**
  Returns true when
  [`viewportChanged`](https://codemirror.net/6/docs/ref/#view.ViewUpdate.viewportChanged) is true
  and the viewport change is not just the result of mapping it in
  response to document changes.
  */
  get viewportMoved() {
    return (this.flags & 8) > 0;
  }
  /**
  Indicates whether the height of a block element in the editor
  changed in this update.
  */
  get heightChanged() {
    return (this.flags & 2) > 0;
  }
  /**
  Returns true when the document was modified or the size of the
  editor, or elements within the editor, changed.
  */
  get geometryChanged() {
    return this.docChanged || (this.flags & 18) > 0;
  }
  /**
  True when this update indicates a focus change.
  */
  get focusChanged() {
    return (this.flags & 1) > 0;
  }
  /**
  Whether the document changed in this update.
  */
  get docChanged() {
    return !this.changes.empty;
  }
  /**
  Whether the selection was explicitly set in this update.
  */
  get selectionSet() {
    return this.transactions.some((e) => e.selection);
  }
  /**
  @internal
  */
  get empty() {
    return this.flags == 0 && this.transactions.length == 0;
  }
}
const sm = [];
class te {
  constructor(e, t, i = 0) {
    this.dom = e, this.length = t, this.flags = i, this.parent = null, e.cmTile = this;
  }
  get breakAfter() {
    return this.flags & 1;
  }
  get children() {
    return sm;
  }
  isWidget() {
    return !1;
  }
  get isHidden() {
    return !1;
  }
  isComposite() {
    return !1;
  }
  isLine() {
    return !1;
  }
  isText() {
    return !1;
  }
  isBlock() {
    return !1;
  }
  get domAttrs() {
    return null;
  }
  sync(e) {
    if (this.flags |= 2, this.flags & 4) {
      this.flags &= -5;
      let t = this.domAttrs;
      t && Lp(this.dom, t);
    }
  }
  toString() {
    return this.constructor.name + (this.children.length ? `(${this.children})` : "") + (this.breakAfter ? "#" : "");
  }
  destroy() {
    this.parent = null;
  }
  setDOM(e) {
    this.dom = e, e.cmTile = this;
  }
  get posAtStart() {
    return this.parent ? this.parent.posBefore(this) : 0;
  }
  get posAtEnd() {
    return this.posAtStart + this.length;
  }
  posBefore(e, t = this.posAtStart) {
    let i = t;
    for (let r of this.children) {
      if (r == e)
        return i;
      i += r.length + r.breakAfter;
    }
    throw new RangeError("Invalid child in posBefore");
  }
  posAfter(e) {
    return this.posBefore(e) + e.length;
  }
  covers(e) {
    return !0;
  }
  coordsIn(e, t, i) {
    return null;
  }
  domPosFor(e, t) {
    let i = Mt(this.dom), r = this.length ? e > 0 : t > 0;
    return new Be(this.parent.dom, i + (r ? 1 : 0), e == 0 || e == this.length);
  }
  markDirty(e) {
    this.flags &= -3, e && (this.flags |= 4), this.parent && this.parent.flags & 2 && this.parent.markDirty(!1);
  }
  get overrideDOMText() {
    return null;
  }
  get root() {
    for (let e = this; e; e = e.parent)
      if (e instanceof ss)
        return e;
    return null;
  }
  static get(e) {
    return e.cmTile;
  }
}
class rs extends te {
  constructor(e) {
    super(e, 0), this._children = [];
  }
  isComposite() {
    return !0;
  }
  get children() {
    return this._children;
  }
  get lastChild() {
    return this.children.length ? this.children[this.children.length - 1] : null;
  }
  append(e) {
    this.children.push(e), e.parent = this;
  }
  sync(e) {
    if (this.flags & 2)
      return;
    super.sync(e);
    let t = this.dom, i = null, r, s = e?.node == t ? e : null, o = 0;
    for (let l of this.children) {
      if (l.sync(e), o += l.length + l.breakAfter, r = i ? i.nextSibling : t.firstChild, s && r != l.dom && (s.written = !0), l.dom.parentNode == t)
        for (; r && r != l.dom; )
          r = Wa(r);
      else
        t.insertBefore(l.dom, r);
      i = l.dom;
    }
    for (r = i ? i.nextSibling : t.firstChild, s && r && (s.written = !0); r; )
      r = Wa(r);
    this.length = o;
  }
}
function Wa(n) {
  let e = n.nextSibling;
  return n.parentNode.removeChild(n), e;
}
class ss extends rs {
  constructor(e, t) {
    super(t), this.view = e;
  }
  owns(e) {
    for (; e; e = e.parent)
      if (e == this)
        return !0;
    return !1;
  }
  isBlock() {
    return !0;
  }
  nearest(e) {
    for (; ; ) {
      if (!e)
        return null;
      let t = te.get(e);
      if (t && this.owns(t))
        return t;
      e = e.parentNode;
    }
  }
  blockTiles(e) {
    for (let t = [], i = this, r = 0, s = 0; ; )
      if (r == i.children.length) {
        if (!t.length)
          return;
        i = i.parent, i.breakAfter && s++, r = t.pop();
      } else {
        let o = i.children[r++];
        if (o instanceof bt)
          t.push(r), i = o, r = 0;
        else {
          let l = s + o.length, a = e(o, s);
          if (a !== void 0)
            return a;
          s = l + o.breakAfter;
        }
      }
  }
  // Find the block at the given position. If side < -1, make sure to
  // stay before block widgets at that position, if side > 1, after
  // such widgets (used for selection drawing, which needs to be able
  // to get coordinates for positions that aren't valid cursor positions).
  resolveBlock(e, t) {
    let i, r = -1, s, o = -1;
    if (this.blockTiles((l, a) => {
      let h = a + l.length;
      if (e >= a && e <= h) {
        if (l.isWidget() && t >= -1 && t <= 1) {
          if (l.flags & 32)
            return !0;
          l.flags & 16 && (i = void 0);
        }
        (a < e || e == h && (t < -1 ? l.length : l.covers(1))) && (!i || !l.isWidget() && i.isWidget()) && (i = l, r = e - a), (h > e || e == a && (t > 1 ? l.length : l.covers(-1))) && (!s || !l.isWidget() && s.isWidget()) && (s = l, o = e - a);
      }
    }), !i && !s)
      throw new Error("No tile at position " + e);
    return i && t < 0 || !s ? { tile: i, offset: r } : { tile: s, offset: o };
  }
}
class bt extends rs {
  constructor(e, t) {
    super(e), this.wrapper = t;
  }
  isBlock() {
    return !0;
  }
  covers(e) {
    return this.children.length ? e < 0 ? this.children[0].covers(-1) : this.lastChild.covers(1) : !1;
  }
  get domAttrs() {
    return this.wrapper.attributes;
  }
  static of(e, t) {
    let i = new bt(t || document.createElement(e.tagName), e);
    return t || (i.flags |= 4), i;
  }
}
class Zi extends rs {
  constructor(e, t) {
    super(e), this.attrs = t;
  }
  isLine() {
    return !0;
  }
  static start(e, t, i) {
    let r = new Zi(t || document.createElement("div"), e);
    return (!t || !i) && (r.flags |= 4), r;
  }
  get domAttrs() {
    return this.attrs;
  }
  // Find the tile associated with a given position in this line.
  // Side -2/2 is handled specially, in that it allows the position
  // returned to be before (-2) or after (2) widgets that would always
  // be after/before a cursor position.
  resolveInline(e, t, i) {
    let r = null, s = -1, o = null, l = -1;
    function a(O, c) {
      for (let f = 0, u = 0; f < O.children.length && u <= c; f++) {
        let d = O.children[f], p = u + d.length;
        p >= c && (d.isComposite() ? a(d, c - u) : (!o || o.isHidden && (t > 0 && !(o.flags & 32) || i && lm(o, d))) && (p > c || d.flags & 32 && t <= 1) ? (o = d, l = c - u) : (u < c || d.flags & 16 && !d.isHidden && t >= -1) && (r = d, s = c - u)), u = p;
      }
    }
    a(this, e);
    let h = (t < 0 ? r : o) || r || o;
    return h ? { tile: h, offset: h == r ? s : l } : null;
  }
  coordsIn(e, t, i) {
    let r = this.resolveInline(e, t, !0);
    return r ? r.tile.coordsIn(Math.max(0, r.offset), t, i) : om(this);
  }
  domIn(e, t) {
    let i = this.resolveInline(e, t);
    if (i) {
      let { tile: r, offset: s } = i;
      if (this.dom.contains(r.dom))
        return r.isText() ? new Be(r.dom, Math.min(r.dom.nodeValue.length, s)) : r.domPosFor(s, r.flags & 16 ? 1 : r.flags & 32 ? -1 : t);
      let o = i.tile.parent, l = !1;
      for (let a of o.children) {
        if (l)
          return new Be(a.dom, 0);
        a == i.tile && (l = !0);
      }
    }
    return new Be(this.dom, 0);
  }
}
function om(n) {
  let e = n.dom.lastChild;
  if (!e)
    return n.dom.getBoundingClientRect();
  let t = sn(e);
  return t[t.length - 1] || null;
}
function lm(n, e) {
  let t = n.coordsIn(0, 1), i = e.coordsIn(0, 1);
  return t && i && i.top < t.bottom;
}
class Pe extends rs {
  constructor(e, t) {
    super(e), this.mark = t;
  }
  get domAttrs() {
    return this.mark.attrs;
  }
  static of(e, t) {
    let i = new Pe(t || document.createElement(e.tagName), e);
    return t || (i.flags |= 4), i;
  }
}
class ei extends te {
  constructor(e, t) {
    super(e, t.length), this.text = t;
  }
  sync(e) {
    this.flags & 2 || (super.sync(e), this.dom.nodeValue != this.text && (e && e.node == this.dom && (e.written = !0), this.dom.nodeValue = this.text));
  }
  isText() {
    return !0;
  }
  toString() {
    return JSON.stringify(this.text);
  }
  coordsIn(e, t, i) {
    let r = this.dom.nodeValue.length;
    e > r && (e = r);
    let s = e, o = e, l = 0;
    e == 0 && t < 0 || e == r && t >= 0 ? v.chrome || v.gecko || (e ? (s--, l = 1) : o < r && (o++, l = -1)) : t < 0 ? s-- : o < r && o++;
    let a = gn(this.dom, s, o).getClientRects();
    if (!a.length)
      return null;
    let h = a[(l ? l < 0 : t >= 0) ? 0 : a.length - 1];
    return v.safari && !l && h.width == 0 && (h = Array.prototype.find.call(a, (O) => O.width) || h), i == null ? h : mn(h, (l ? l > 0 : t < 0) == i);
  }
  static of(e, t) {
    let i = new ei(t || document.createTextNode(e), e);
    return t || (i.flags |= 2), i;
  }
}
class oi extends te {
  constructor(e, t, i, r) {
    super(e, t, r), this.widget = i;
  }
  isWidget() {
    return !0;
  }
  get isHidden() {
    return this.widget.isHidden;
  }
  covers(e) {
    return this.flags & 48 ? !1 : (this.flags & (e < 0 ? 64 : 128)) > 0;
  }
  coordsIn(e, t) {
    return this.coordsInWidget(e, t, !1);
  }
  coordsInWidget(e, t, i) {
    let r = this.widget.coordsAt(this.dom, e, t);
    if (r)
      return r;
    if (i)
      return mn(this.dom.getBoundingClientRect(), this.length ? e == 0 : t <= 0);
    {
      let s = this.dom.getClientRects(), o = null;
      if (!s.length)
        return null;
      let l = this.flags & 16 ? !0 : this.flags & 32 ? !1 : e > 0;
      for (let a = l ? s.length - 1 : 0; o = s[a], !(e > 0 ? a == 0 : a == s.length - 1 || o.top < o.bottom); a += l ? -1 : 1)
        ;
      return mn(o, !l);
    }
  }
  get overrideDOMText() {
    if (!this.length)
      return Y.empty;
    let { root: e } = this;
    if (!e)
      return Y.empty;
    let t = this.posAtStart;
    return e.view.state.doc.slice(t, t + this.length);
  }
  destroy() {
    super.destroy(), this.widget.destroy(this.dom);
  }
  static of(e, t, i, r, s) {
    return s || (s = e.toDOM(t), e.editable || (s.contentEditable = "false")), new oi(s, i, e, r);
  }
}
class vr extends te {
  constructor(e) {
    let t = document.createElement("img");
    t.className = "cm-widgetBuffer", t.setAttribute("aria-hidden", "true"), super(t, 0, e);
  }
  get isHidden() {
    return !0;
  }
  get overrideDOMText() {
    return Y.empty;
  }
  coordsIn(e, t, i) {
    let r = this.dom.getBoundingClientRect();
    return i == null ? r : mn(r, t > 0 == i);
  }
}
class am {
  constructor(e) {
    this.index = 0, this.beforeBreak = !1, this.parents = [], this.tile = e;
  }
  // Advance by the given distance. If side is -1, stop leaving or
  // entering tiles, or skipping zero-length tiles, once the distance
  // has been traversed. When side is 1, leave, enter, or skip
  // everything at the end position.
  advance(e, t, i) {
    let { tile: r, index: s, beforeBreak: o, parents: l } = this;
    for (; e || t > 0; )
      if (r.isComposite())
        if (o) {
          if (!e)
            break;
          i && i.break(), e--, o = !1;
        } else if (s == r.children.length) {
          if (!e && !l.length)
            break;
          i && i.leave(r), o = !!r.breakAfter, { tile: r, index: s } = l.pop(), s++;
        } else {
          let a = r.children[s], h = a.breakAfter;
          (t > 0 ? a.length <= e : a.length < e) && (!i || i.skip(a, 0, a.length) !== !1 || !a.isComposite) ? (o = !!h, s++, e -= a.length) : (l.push({ tile: r, index: s }), r = a, s = 0, i && a.isComposite() && i.enter(a));
        }
      else {
        let a = r.length;
        if (s < a && e) {
          let h = Math.min(e, a - s);
          i && i.skip(r, s, s + h), e -= h, s += h;
        }
        if (s == a)
          o = !!r.breakAfter, { tile: r, index: s } = l.pop(), s++;
        else if (!e)
          break;
      }
    return this.tile = r, this.index = s, this.beforeBreak = o, this;
  }
  get root() {
    return this.parents.length ? this.parents[0].tile : this.tile;
  }
}
class hm {
  constructor(e, t, i, r) {
    this.from = e, this.to = t, this.wrapper = i, this.rank = r;
  }
}
class Om {
  constructor(e, t, i) {
    this.cache = e, this.root = t, this.blockWrappers = i, this.curLine = null, this.lastBlock = null, this.afterWidget = null, this.pos = 0, this.wrappers = [], this.wrapperPos = 0;
  }
  addText(e, t, i, r) {
    var s;
    this.flushBuffer();
    let o = this.ensureMarks(t, i), l = o.lastChild;
    if (l && l.isText() && !(l.flags & 8) && l.length + e.length < 512) {
      this.cache.reused.set(
        l,
        2
        /* Reused.DOM */
      );
      let a = o.children[o.children.length - 1] = new ei(l.dom, l.text + e);
      a.parent = o;
    } else
      o.append(r || ei.of(e, (s = this.cache.find(ei)) === null || s === void 0 ? void 0 : s.dom));
    this.pos += e.length, this.afterWidget = null;
  }
  addComposition(e, t) {
    let i = this.curLine;
    i.dom != t.line.dom && (i.setDOM(this.cache.reused.has(t.line) ? ws(t.line.dom) : t.line.dom), this.cache.reused.set(
      t.line,
      2
      /* Reused.DOM */
    ));
    let r = i;
    for (let l = t.marks.length - 1; l >= 0; l--) {
      let a = t.marks[l], h = r.lastChild;
      if (h instanceof Pe && h.mark.eq(a.mark))
        h.dom != a.dom && h.setDOM(ws(a.dom)), r = h;
      else {
        let { dom: O } = a;
        this.cache.reused.get(a) && te.get(a.dom) && (O = ws(a.dom));
        let c = Pe.of(a.mark, O);
        r.append(c), r = c;
      }
      this.cache.reused.set(
        a,
        2
        /* Reused.DOM */
      );
    }
    let s = te.get(e.text);
    s && this.cache.reused.set(
      s,
      2
      /* Reused.DOM */
    );
    let o = new ei(e.text, e.text.nodeValue);
    o.flags |= 8, this.pos = e.range.toB, r.append(o);
  }
  addInlineWidget(e, t, i) {
    let r = this.afterWidget && e.flags & 48 && (this.afterWidget.flags & 48) == (e.flags & 48);
    r || this.flushBuffer();
    let s = this.ensureMarks(t, i);
    !r && !(e.flags & 16) && s.append(this.getBuffer(1)), s.append(e), this.pos += e.length, this.afterWidget = e;
  }
  addMark(e, t, i) {
    this.flushBuffer(), this.ensureMarks(t, i).append(e), this.pos += e.length, this.afterWidget = null;
  }
  addBlockWidget(e) {
    this.getBlockPos().append(e), this.pos += e.length, this.lastBlock = e, this.endLine();
  }
  continueWidget(e) {
    let t = this.afterWidget || this.lastBlock;
    t.length += e, this.pos += e;
  }
  addLineStart(e, t) {
    var i;
    e || (e = Dc);
    let r = Zi.start(e, t || ((i = this.cache.find(Zi)) === null || i === void 0 ? void 0 : i.dom), !!t);
    this.getBlockPos().append(this.lastBlock = this.curLine = r);
  }
  addLine(e) {
    this.getBlockPos().append(e), this.pos += e.length, this.lastBlock = e, this.endLine();
  }
  addBreak() {
    this.lastBlock.flags |= 1, this.endLine(), this.pos++;
  }
  addLineStartIfNotCovered(e) {
    this.blockPosCovered() || this.addLineStart(e);
  }
  ensureLine(e) {
    this.curLine || this.addLineStart(e);
  }
  ensureMarks(e, t) {
    var i;
    let r = this.curLine;
    for (let s = e.length - 1; s >= 0; s--) {
      let o = e[s], l;
      if (t > 0 && (l = r.lastChild) && l instanceof Pe && l.mark.eq(o))
        r = l, t--;
      else {
        let a = Pe.of(o, (i = this.cache.find(Pe, (h) => h.mark.eq(o))) === null || i === void 0 ? void 0 : i.dom);
        r.append(a), r = a, t = 0;
      }
    }
    return r;
  }
  endLine() {
    if (this.curLine) {
      this.flushBuffer();
      let e = this.curLine.lastChild;
      (!e || !za(this.curLine, !1) || e.dom.nodeName != "BR" && e.isWidget() && !(v.ios && za(this.curLine, !0))) && this.curLine.append(this.cache.findWidget(
        vs,
        0,
        32
        /* TileFlag.After */
      ) || new oi(
        vs.toDOM(),
        0,
        vs,
        32
        /* TileFlag.After */
      )), this.curLine = this.afterWidget = null;
    }
  }
  updateBlockWrappers() {
    this.wrapperPos > this.pos + 1e4 && (this.blockWrappers.goto(this.pos), this.wrappers.length = 0);
    for (let e = this.wrappers.length - 1; e >= 0; e--)
      this.wrappers[e].to < this.pos && this.wrappers.splice(e, 1);
    for (let e = this.blockWrappers; e.value && e.from <= this.pos; e.next())
      if (e.to >= this.pos) {
        let t = e.rank * 102 + e.value.rank, i = new hm(e.from, e.to, e.value, t), r = this.wrappers.length;
        for (; r > 0 && (this.wrappers[r - 1].rank - i.rank || this.wrappers[r - 1].to - i.to) < 0; )
          r--;
        this.wrappers.splice(r, 0, i);
      }
    this.wrapperPos = this.pos;
  }
  getBlockPos() {
    var e;
    this.updateBlockWrappers();
    let t = this.root;
    for (let i of this.wrappers) {
      let r = t.lastChild;
      if (i.from < this.pos && r instanceof bt && r.wrapper.eq(i.wrapper))
        t = r;
      else {
        let s = bt.of(i.wrapper, (e = this.cache.find(bt, (o) => o.wrapper.eq(i.wrapper))) === null || e === void 0 ? void 0 : e.dom);
        t.append(s), t = s;
      }
    }
    return t;
  }
  blockPosCovered() {
    let e = this.lastBlock;
    return e != null && !e.breakAfter && (!e.isWidget() || (e.flags & 160) > 0);
  }
  getBuffer(e) {
    let t = 2 | (e < 0 ? 16 : 32), i = this.cache.find(
      vr,
      void 0,
      1
      /* Reused.Full */
    );
    return i && (i.flags = t), i || new vr(t);
  }
  flushBuffer() {
    this.afterWidget && !(this.afterWidget.flags & 32) && (this.afterWidget.parent.append(this.getBuffer(-1)), this.afterWidget = null);
  }
}
class cm {
  constructor(e) {
    this.skipCount = 0, this.text = "", this.textOff = 0, this.cursor = e.iter();
  }
  skip(e) {
    this.textOff + e <= this.text.length ? this.textOff += e : (this.skipCount += e - (this.text.length - this.textOff), this.text = "", this.textOff = 0);
  }
  next(e) {
    if (this.textOff == this.text.length) {
      let { value: r, lineBreak: s, done: o } = this.cursor.next(this.skipCount);
      if (this.skipCount = 0, o)
        throw new Error("Ran out of text content when drawing inline views");
      this.text = r;
      let l = this.textOff = Math.min(e, r.length);
      return s ? null : r.slice(0, l);
    }
    let t = Math.min(this.text.length, this.textOff + e), i = this.text.slice(this.textOff, t);
    return this.textOff = t, i;
  }
}
const Tr = [oi, Zi, ei, Pe, vr, bt, ss];
for (let n = 0; n < Tr.length; n++)
  Tr[n].bucket = n;
class fm {
  constructor(e) {
    this.view = e, this.buckets = Tr.map(() => []), this.index = Tr.map(() => 0), this.reused = /* @__PURE__ */ new Map();
  }
  // Put a tile in the cache.
  add(e) {
    let t = e.constructor.bucket, i = this.buckets[t];
    i.length < 6 ? i.push(e) : i[
      this.index[t] = (this.index[t] + 1) % 6
      /* C.Bucket */
    ] = e;
  }
  find(e, t, i = 2) {
    let r = e.bucket, s = this.buckets[r], o = this.index[r];
    for (let l = 0; l < s.length; l++) {
      let a = (l + o) % s.length, h = s[a];
      if ((!t || t(h)) && !this.reused.has(h))
        return s.splice(a, 1), a < o && this.index[r]--, this.reused.set(h, i), h;
    }
    return null;
  }
  findWidget(e, t, i) {
    let r = this.buckets[0];
    if (r.length)
      for (let s = 0, o = 0; ; s++) {
        if (s == r.length) {
          if (o)
            return null;
          o = 1, s = 0;
        }
        let l = r[s];
        if (!this.reused.has(l) && (o == 0 ? l.widget.compare(e) : l.widget.constructor == e.constructor && e.updateDOM(l.dom, this.view, l.widget)))
          return r.splice(s, 1), s < this.index[0] && this.index[0]--, l.widget == e && l.length == t && (l.flags & 497) == i ? (this.reused.set(
            l,
            1
            /* Reused.Full */
          ), l) : (this.reused.set(
            l,
            2
            /* Reused.DOM */
          ), new oi(l.dom, t, e, l.flags & -498 | i));
      }
  }
  reuse(e) {
    return this.reused.set(
      e,
      1
      /* Reused.Full */
    ), e;
  }
  maybeReuse(e, t = 2) {
    if (!this.reused.has(e))
      return this.reused.set(e, t), e.dom;
  }
  clear() {
    for (let e = 0; e < this.buckets.length; e++)
      this.buckets[e].length = this.index[e] = 0;
  }
}
class um {
  constructor(e, t, i, r, s) {
    this.view = e, this.decorations = r, this.disallowBlockEffectsFor = s, this.openWidget = !1, this.openMarks = 0, this.cache = new fm(e), this.text = new cm(e.state.doc), this.builder = new Om(this.cache, new ss(e, e.contentDOM), _.iter(i)), this.cache.reused.set(
      t,
      2
      /* Reused.DOM */
    ), this.old = new am(t), this.reuseWalker = {
      skip: (o, l, a) => {
        if (this.cache.add(o), o.isComposite())
          return !1;
      },
      enter: (o) => this.cache.add(o),
      leave: () => {
      },
      break: () => {
      }
    };
  }
  run(e, t) {
    let i = t && this.getCompositionContext(t.text);
    for (let r = 0, s = 0, o = 0; ; ) {
      let l = o < e.length ? e[o++] : null, a = l ? l.fromA : this.old.root.length;
      if (a > r) {
        let h = a - r;
        this.preserve(h, !o, !l), r = a, s += h;
      }
      if (!l)
        break;
      t && l.fromA <= t.range.fromA && l.toA >= t.range.toA ? (this.forward(l.fromA, t.range.fromA, t.range.fromA < t.range.toA ? 1 : -1), this.emit(s, t.range.fromB), this.builder.flushBuffer(), this.cache.clear(), this.builder.addComposition(t, i), this.text.skip(t.range.toB - t.range.fromB), this.forward(t.range.fromA, l.toA), this.emit(t.range.toB, l.toB)) : (this.forward(l.fromA, l.toA), this.emit(s, l.toB)), s = l.toB, r = l.toA;
    }
    return this.builder.curLine && this.builder.endLine(), this.builder.root;
  }
  preserve(e, t, i) {
    let r = mm(this.old), s = this.openMarks;
    this.old.advance(e, i ? 1 : -1, {
      skip: (o, l, a) => {
        if (o.isWidget())
          if (this.openWidget)
            this.builder.continueWidget(a - l);
          else {
            let h = a > 0 || l < o.length ? oi.of(o.widget, this.view, a - l, o.flags & 496, this.cache.maybeReuse(o)) : this.cache.reuse(o);
            h.flags & 256 ? (h.flags &= -2, this.builder.addBlockWidget(h)) : (this.builder.ensureLine(null), this.builder.addInlineWidget(h, r, s), s = r.length);
          }
        else if (o.isText())
          this.builder.ensureLine(null), !l && a == o.length && !this.cache.reused.has(o) ? this.builder.addText(o.text, r, s, this.cache.reuse(o)) : (this.cache.add(o), this.builder.addText(o.text.slice(l, a), r, s)), s = r.length;
        else if (o.isLine())
          o.flags &= -2, this.cache.reused.set(
            o,
            1
            /* Reused.Full */
          ), this.builder.addLine(o);
        else if (o instanceof vr)
          this.cache.add(o);
        else if (o instanceof Pe)
          this.builder.ensureLine(null), this.builder.addMark(o, r, s), this.cache.reused.set(
            o,
            1
            /* Reused.Full */
          ), s = r.length;
        else
          return !1;
        this.openWidget = !1;
      },
      enter: (o) => {
        o.isLine() ? this.builder.addLineStart(o.attrs, this.cache.maybeReuse(o)) : (this.cache.add(o), o instanceof Pe && r.unshift(o.mark)), this.openWidget = !1;
      },
      leave: (o) => {
        o.isLine() ? r.length && (r.length = s = 0) : o instanceof Pe && (r.shift(), s = Math.min(s, r.length));
      },
      break: () => {
        this.builder.addBreak(), this.openWidget = !1;
      }
    }), this.text.skip(e);
  }
  emit(e, t) {
    let i = null, r = this.builder, s = -1, o = _.spans(this.decorations, e, t, {
      point: (l, a, h, O, c, f) => {
        if (h instanceof ri) {
          if (this.disallowBlockEffectsFor[f]) {
            if (h.block)
              throw new RangeError("Block decorations may not be specified via plugins");
            if (a > this.view.state.doc.lineAt(l).to)
              throw new RangeError("Decorations that replace line breaks may not be specified via plugins");
          }
          if (s = O.length, c > O.length)
            r.continueWidget(a - l);
          else {
            let u = h.widget || (h.block ? Ri.block : Ri.inline), d = dm(h), p = this.cache.findWidget(u, a - l, d) || oi.of(u, this.view, a - l, d);
            h.block ? (h.startSide > 0 && r.addLineStartIfNotCovered(i), r.addBlockWidget(p)) : (r.ensureLine(i), r.addInlineWidget(p, O, c));
          }
          i = null;
        } else
          i = pm(i, h);
        a > l && this.text.skip(a - l);
      },
      span: (l, a, h, O) => {
        for (let c = l; c < a; ) {
          let f = this.text.next(Math.min(512, a - c));
          f == null ? (r.addLineStartIfNotCovered(i), r.addBreak(), c++) : (r.ensureLine(i), r.addText(f, h, c == l ? O : h.length), c += f.length), i = null;
        }
        s = h.length;
      }
    });
    s > -1 && (this.openWidget = o > s), this.openWidget || r.addLineStartIfNotCovered(i), this.openMarks = o;
  }
  forward(e, t, i = 1) {
    t - e <= 10 ? this.old.advance(t - e, i, this.reuseWalker) : (this.old.advance(5, -1, this.reuseWalker), this.old.advance(t - e - 10, -1), this.old.advance(5, i, this.reuseWalker));
  }
  getCompositionContext(e) {
    let t = [], i = null;
    for (let r = e.parentNode; ; r = r.parentNode) {
      let s = te.get(r);
      if (r == this.view.contentDOM)
        break;
      s instanceof Pe ? t.push(s) : s?.isLine() ? i = s : s instanceof bt || (r.nodeName == "DIV" && !i ? i = new Zi(r, Dc) : i || t.push(Pe.of(new Cn({ tagName: r.nodeName.toLowerCase(), attributes: Yp(r) }), r)));
    }
    return i ? { line: i, marks: t } : null;
  }
}
function za(n, e) {
  let t = (i) => {
    for (let r of i.children)
      if ((e ? r.isText() : r.length) || t(r))
        return !0;
    return !1;
  };
  return t(n);
}
function dm(n) {
  let e = n.isReplace ? (n.startSide < 0 ? 64 : 0) | (n.endSide > 0 ? 128 : 0) : n.startSide > 0 ? 32 : 16;
  return n.block && (e |= 256), e;
}
const Dc = { class: "cm-line" };
function pm(n, e) {
  let t = e.spec.attributes, i = e.spec.class;
  return !t && !i || (n || (n = { class: "cm-line" }), t && bl(t, n), i && (n.class += " " + i)), n;
}
function mm(n) {
  let e = [];
  for (let t = n.parents.length; t > 1; t--) {
    let i = t == n.parents.length ? n.tile : n.parents[t].tile;
    i instanceof Pe && e.push(i.mark);
  }
  return e;
}
function ws(n) {
  let e = te.get(n);
  return e && e.setDOM(n.cloneNode()), n;
}
class Ri extends Ut {
  constructor(e) {
    super(), this.tag = e;
  }
  eq(e) {
    return e.tag == this.tag;
  }
  toDOM() {
    return document.createElement(this.tag);
  }
  updateDOM(e) {
    return e.nodeName.toLowerCase() == this.tag;
  }
  get isHidden() {
    return !0;
  }
}
Ri.inline = /* @__PURE__ */ new Ri("span");
Ri.block = /* @__PURE__ */ new Ri("div");
const vs = /* @__PURE__ */ new class extends Ut {
  toDOM() {
    return document.createElement("br");
  }
  get isHidden() {
    return !0;
  }
  get editable() {
    return !0;
  }
}();
class Ma {
  constructor(e) {
    this.view = e, this.decorations = [], this.blockWrappers = [], this.dynamicDecorationMap = [!1], this.domChanged = null, this.hasComposition = null, this.editContextFormatting = A.none, this.lastCompositionAfterCursor = !1, this.minWidth = 0, this.minWidthFrom = 0, this.minWidthTo = 0, this.impreciseAnchor = null, this.impreciseHead = null, this.forceSelection = !1, this.lastUpdate = Date.now(), this.updateDeco(), this.tile = new ss(e, e.contentDOM), this.updateInner([new _e(0, 0, 0, e.state.doc.length)], null);
  }
  // Update the document view to a given state.
  update(e) {
    var t;
    let i = e.changedRanges;
    this.minWidth > 0 && i.length && (i.every(({ fromA: O, toA: c }) => c < this.minWidthFrom || O > this.minWidthTo) ? (this.minWidthFrom = e.changes.mapPos(this.minWidthFrom, 1), this.minWidthTo = e.changes.mapPos(this.minWidthTo, 1)) : this.minWidth = this.minWidthFrom = this.minWidthTo = 0), this.updateEditContextFormatting(e);
    let r = -1;
    this.view.inputState.composing >= 0 && !this.view.observer.editContext && (!((t = this.domChanged) === null || t === void 0) && t.newSel ? r = this.domChanged.newSel.head : !Pm(e.changes, this.hasComposition) && !e.selectionSet && (r = e.state.selection.main.head));
    let s = r > -1 ? Qm(this.view, e.changes, r) : null;
    if (this.domChanged = null, this.hasComposition) {
      let { from: O, to: c } = this.hasComposition;
      i = new _e(O, c, e.changes.mapPos(O, -1), e.changes.mapPos(c, 1)).addToSet(i.slice());
    }
    this.hasComposition = s ? { from: s.range.fromB, to: s.range.toB } : null, (v.ie || v.chrome) && !s && e && e.state.doc.lines != e.startState.doc.lines && (this.forceSelection = !0);
    let o = this.decorations, l = this.blockWrappers;
    this.updateDeco();
    let a = ym(o, this.decorations, e.changes);
    a.length && (i = _e.extendWithRanges(i, a));
    let h = $m(l, this.blockWrappers, e.changes);
    return h.length && (i = _e.extendWithRanges(i, h)), s && !i.some((O) => O.fromA <= s.range.fromA && O.toA >= s.range.toA) && (i = s.range.addToSet(i.slice())), this.tile.flags & 2 && i.length == 0 ? !1 : (this.updateInner(i, s), e.transactions.length && (this.lastUpdate = Date.now()), !0);
  }
  // Used by update and the constructor do perform the actual DOM
  // update
  updateInner(e, t) {
    this.view.viewState.mustMeasureContent = !0;
    let { observer: i } = this.view;
    i.ignore(() => {
      if (t || e.length) {
        let o = this.tile, l = new um(this.view, o, this.blockWrappers, this.decorations, this.dynamicDecorationMap);
        t && te.get(t.text) && l.cache.reused.set(
          te.get(t.text),
          2
          /* Reused.DOM */
        ), this.tile = l.run(e, t), Mo(o, l.cache.reused);
      }
      this.tile.dom.style.height = this.view.viewState.contentHeight / this.view.scaleY + "px", this.tile.dom.style.flexBasis = this.minWidth ? this.minWidth + "px" : "";
      let s = v.chrome || v.ios ? { node: i.selectionRange.focusNode, written: !1 } : void 0;
      this.tile.sync(s), s && (s.written || i.selectionRange.focusNode != s.node || !this.tile.dom.contains(s.node)) && (this.forceSelection = !0), this.tile.dom.style.height = "";
    });
    let r = [];
    if (this.view.viewport.from || this.view.viewport.to < this.view.state.doc.length)
      for (let s of this.tile.children)
        s.isWidget() && s.widget instanceof Ts && r.push(s.dom);
    i.updateGaps(r);
  }
  updateEditContextFormatting(e) {
    this.editContextFormatting = this.editContextFormatting.map(e.changes);
    for (let t of e.transactions)
      for (let i of t.effects)
        i.is(Ec) && (this.editContextFormatting = i.value);
  }
  // Sync the DOM selection to this.state.selection
  updateSelection(e = !1, t = !1) {
    (e || !this.view.observer.selectionRange.focusNode) && this.view.observer.readSelectionRange();
    let { dom: i } = this.tile, r = this.view.root.activeElement, s = r == i, o = !s && !(this.view.state.facet(St) || i.tabIndex > -1) && rn(i, this.view.observer.selectionRange) && !(r && i.contains(r));
    if (!(s || t || o))
      return;
    let l = this.forceSelection;
    this.forceSelection = !1;
    let a = this.view.state.selection.main, h, O;
    if (a.empty ? O = h = this.inlineDOMNearPos(a.anchor, a.assoc || 1) : (O = this.inlineDOMNearPos(a.head, a.head == a.from ? 1 : -1), h = this.inlineDOMNearPos(a.anchor, a.anchor == a.from ? 1 : -1)), v.gecko && a.empty && !this.hasComposition && gm(h)) {
      let f = document.createTextNode("");
      this.view.observer.ignore(() => h.node.insertBefore(f, h.node.childNodes[h.offset] || null)), h = O = new Be(f, 0), l = !0;
    }
    let c = this.view.observer.selectionRange;
    (l || !c.focusNode || (!on(h.node, h.offset, c.anchorNode, c.anchorOffset) || !on(O.node, O.offset, c.focusNode, c.focusOffset)) && !this.suppressWidgetCursorChange(c, a)) && (this.view.observer.ignore(() => {
      v.android && v.chrome && i.contains(c.focusNode) && xm(c.focusNode, i) && (i.blur(), i.focus({ preventScroll: !0 }));
      let f = pn(this.view.root);
      if (f) if (a.empty) {
        if (v.gecko) {
          let u = Sm(h.node, h.offset);
          if (u && u != 3) {
            let d = (u == 1 ? xc : Pc)(h.node, h.offset);
            d && (h = new Be(d.node, d.offset));
          }
        }
        f.collapse(h.node, h.offset), a.bidiLevel != null && f.caretBidiLevel !== void 0 && (f.caretBidiLevel = a.bidiLevel);
      } else if (f.extend) {
        f.collapse(h.node, h.offset);
        try {
          f.extend(O.node, O.offset);
        } catch {
        }
      } else {
        let u = document.createRange();
        a.anchor > a.head && ([h, O] = [O, h]), u.setEnd(O.node, O.offset), u.setStart(h.node, h.offset), f.removeAllRanges(), f.addRange(u);
      }
      o && this.view.root.activeElement == i && (i.blur(), r && r.focus());
    }), this.view.observer.setSelectionRange(h, O)), this.impreciseAnchor = h.precise ? null : new Be(c.anchorNode, c.anchorOffset), this.impreciseHead = O.precise ? null : new Be(c.focusNode, c.focusOffset);
  }
  // If a zero-length widget is inserted next to the cursor during
  // composition, avoid moving it across it and disrupting the
  // composition.
  suppressWidgetCursorChange(e, t) {
    return this.hasComposition && t.empty && on(e.focusNode, e.focusOffset, e.anchorNode, e.anchorOffset) && this.posFromDOM(e.focusNode, e.focusOffset) == t.head;
  }
  enforceCursorAssoc() {
    if (this.hasComposition)
      return;
    let { view: e } = this, t = e.state.selection.main, i = pn(e.root), { anchorNode: r, anchorOffset: s } = e.observer.selectionRange;
    if (!i || !t.empty || !t.assoc || !i.modify)
      return;
    let o = this.lineAt(t.head, t.assoc);
    if (!o)
      return;
    let l = o.posAtStart;
    if (t.head == l || t.head == l + o.length)
      return;
    let a = this.coordsAt(t.head, -1), h = this.coordsAt(t.head, 1);
    if (!a || !h || a.bottom > h.top)
      return;
    let O = this.domAtPos(t.head + t.assoc, t.assoc);
    i.collapse(O.node, O.offset), i.modify("move", t.assoc < 0 ? "forward" : "backward", "lineboundary"), e.observer.readSelectionRange();
    let c = e.observer.selectionRange;
    e.docView.posFromDOM(c.anchorNode, c.anchorOffset) != t.from && i.collapse(r, s);
  }
  posFromDOM(e, t) {
    let i = this.tile.nearest(e);
    if (!i)
      return this.tile.dom.compareDocumentPosition(e) & 2 ? 0 : this.view.state.doc.length;
    let r = i.posAtStart;
    if (i.isComposite()) {
      let s;
      if (e == i.dom)
        s = i.dom.childNodes[t];
      else {
        let o = kt(e) == 0 ? 0 : t == 0 ? -1 : 1;
        for (; ; ) {
          let l = e.parentNode;
          if (l == i.dom)
            break;
          o == 0 && l.firstChild != l.lastChild && (e == l.firstChild ? o = -1 : o = 1), e = l;
        }
        o < 0 ? s = e : s = e.nextSibling;
      }
      if (s == i.dom.firstChild)
        return r;
      for (; s && !te.get(s); )
        s = s.nextSibling;
      if (!s)
        return r + i.length;
      for (let o = 0, l = r; ; o++) {
        let a = i.children[o];
        if (a.dom == s)
          return l;
        l += a.length + a.breakAfter;
      }
    } else return i.isText() ? e == i.dom ? r + t : r + (t ? i.length : 0) : r;
  }
  domAtPos(e, t) {
    let { tile: i, offset: r } = this.tile.resolveBlock(e, t);
    return i.isWidget() ? i.domPosFor(r, t) : i.domIn(r, t);
  }
  inlineDOMNearPos(e, t) {
    let i, r = -1, s = !1, o, l = -1, a = !1;
    return this.tile.blockTiles((h, O) => {
      if (h.isWidget()) {
        if (h.flags & 32 && O >= e)
          return !0;
        h.flags & 16 && (s = !0);
      } else {
        let c = O + h.length;
        if (O <= e && (i = h, r = e - O, s = c < e), c >= e && !o && (o = h, l = e - O, a = O > e), O > e && o)
          return !0;
      }
    }), !i && !o ? this.domAtPos(e, t) : (s && o ? i = null : a && i && (o = null), i && t < 0 || !o ? i.domIn(r, t) : o.domIn(l, t));
  }
  // Get the coord of the element at the given side of the given
  // position. If rtl is given, flatten it using that text direction.
  coordsAt(e, t, i) {
    let { tile: r, offset: s } = this.tile.resolveBlock(e, t);
    return r.isWidget() ? r.widget instanceof Ts ? null : r.coordsInWidget(s, t, !0) : r.coordsIn(s, t, i);
  }
  lineAt(e, t) {
    let { tile: i } = this.tile.resolveBlock(e, t);
    return i.isLine() ? i : null;
  }
  coordsForChar(e) {
    let { tile: t, offset: i } = this.tile.resolveBlock(e, 1);
    if (!t.isLine())
      return null;
    function r(s, o) {
      if (s.isComposite())
        for (let l of s.children) {
          if (l.length >= o) {
            let a = r(l, o);
            if (a)
              return a;
          }
          if (o -= l.length, o < 0)
            break;
        }
      else if (s.isText() && o < s.length) {
        let l = he(s.text, o);
        if (l == o)
          return null;
        let a = gn(s.dom, o, l).getClientRects();
        for (let h = 0; h < a.length; h++) {
          let O = a[h];
          if (h == a.length - 1 || O.top < O.bottom && O.left < O.right)
            return O;
        }
      }
      return null;
    }
    return r(t, i);
  }
  measureVisibleLineHeights(e) {
    let t = [], { from: i, to: r } = e, s = this.view.contentDOM.clientWidth, o = s > Math.max(this.view.scrollDOM.clientWidth, this.minWidth) + 1, l = -1, a = this.view.textDirection == K.LTR, h = 0, O = (c, f, u) => {
      for (let d = 0; d < c.children.length && !(f > r); d++) {
        let p = c.children[d], g = f + p.length, Q = p.dom.getBoundingClientRect(), { height: b } = Q;
        if (u && !d && (h += Q.top - u.top), p instanceof bt)
          g > i && O(p, f, Q);
        else if (f >= i && (h > 0 && t.push(-h), t.push(b + h), h = 0, o)) {
          let y = p.dom.lastChild, C = y ? sn(y) : [];
          if (C.length) {
            let k = C[C.length - 1], x = a ? k.right - Q.left : Q.right - k.left;
            x > l && (l = x, this.minWidth = s, this.minWidthFrom = f, this.minWidthTo = g);
          }
        }
        u && d == c.children.length - 1 && (h += u.bottom - Q.bottom), f = g + p.breakAfter;
      }
    };
    return O(this.tile, 0, null), t;
  }
  textDirectionAt(e) {
    let { tile: t } = this.tile.resolveBlock(e, 1);
    return getComputedStyle(t.dom).direction == "rtl" ? K.RTL : K.LTR;
  }
  measureTextSize() {
    let e = this.tile.blockTiles((o) => {
      if (o.isLine() && o.children.length && o.length <= 20) {
        let l = 0, a;
        for (let h of o.children) {
          if (!h.isText() || /[^ -~]/.test(h.text))
            return;
          let O = sn(h.dom);
          if (O.length != 1)
            return;
          l += O[0].width, a = O[0].height;
        }
        if (l)
          return {
            lineHeight: o.dom.getBoundingClientRect().height,
            charWidth: l / o.length,
            textHeight: a
          };
      }
    });
    if (e)
      return e;
    let t = document.createElement("div"), i, r, s;
    return t.className = "cm-line", t.style.width = "99999px", t.style.position = "absolute", t.textContent = "abc def ghi jkl mno pqr stu", this.view.observer.ignore(() => {
      this.tile.dom.appendChild(t);
      let o = sn(t.firstChild)[0];
      i = t.getBoundingClientRect().height, r = o && o.width ? o.width / 27 : 7, s = o && o.height ? o.height : i, t.remove();
    }), { lineHeight: i, charWidth: r, textHeight: s };
  }
  computeBlockGapDeco() {
    let e = [], t = this.view.viewState;
    for (let i = 0, r = 0; ; r++) {
      let s = r == t.viewports.length ? null : t.viewports[r], o = s ? s.from - 1 : this.view.state.doc.length;
      if (o > i) {
        let l = (t.lineBlockAt(o).bottom - t.lineBlockAt(i).top) / this.view.scaleY;
        e.push(A.replace({
          widget: new Ts(l),
          block: !0,
          inclusive: !0,
          isBlockGap: !0
        }).range(i, o));
      }
      if (!s)
        break;
      i = s.to + 1;
    }
    return A.set(e);
  }
  updateDeco() {
    let e = 1, t = this.view.state.facet(ns).map((s) => (this.dynamicDecorationMap[e++] = typeof s == "function") ? s(this.view) : s), i = !1, r = this.view.state.facet(wl).map((s, o) => {
      let l = typeof s == "function";
      return l && (i = !0), l ? s(this.view) : s;
    });
    for (r.length && (this.dynamicDecorationMap[e++] = i, t.push(_.join(r))), this.decorations = [
      this.editContextFormatting,
      ...t,
      this.computeBlockGapDeco(),
      this.view.viewState.lineGapDeco
    ]; e < this.decorations.length; )
      this.dynamicDecorationMap[e++] = !1;
    this.blockWrappers = this.view.state.facet(Yc).map((s) => typeof s == "function" ? s(this.view) : s);
  }
  scrollIntoView(e) {
    if (e.isSnapshot) {
      let h = this.view.viewState.lineBlockAt(e.range.head);
      this.view.scrollDOM.scrollTop = h.top - e.yMargin, this.view.scrollDOM.scrollLeft = e.xMargin;
      return;
    }
    for (let h of this.view.state.facet(_c))
      try {
        if (h(this.view, e.range, e))
          return !0;
      } catch (O) {
        je(this.view.state, O, "scroll handler");
      }
    let { range: t } = e, i = this.coordsAt(t.head, t.assoc || (t.head > t.anchor ? -1 : 1)), r;
    if (!i)
      return;
    !t.empty && (r = this.coordsAt(t.anchor, t.anchor > t.head ? -1 : 1)) && (i = {
      left: Math.min(i.left, r.left),
      top: Math.min(i.top, r.top),
      right: Math.max(i.right, r.right),
      bottom: Math.max(i.bottom, r.bottom)
    });
    let s = vl(this.view), o = {
      left: i.left - s.left,
      top: i.top - s.top,
      right: i.right + s.right,
      bottom: i.bottom + s.bottom
    }, { offsetWidth: l, offsetHeight: a } = this.view.scrollDOM;
    if (Dp(this.view.scrollDOM, o, t.head < t.anchor ? -1 : 1, e.x, e.y, Math.max(Math.min(e.xMargin, l), -l), Math.max(Math.min(e.yMargin, a), -a), this.view.textDirection == K.LTR), window.visualViewport && window.innerHeight - window.visualViewport.height > 1 && (i.top > window.visualViewport.offsetTop + window.visualViewport.height || i.bottom < window.visualViewport.offsetTop)) {
      let h = this.view.docView.lineAt(t.head, 1);
      if (h) {
        let O = bc(h.dom);
        h.dom.scrollIntoView({ block: "nearest" }), yc(O, !1);
      }
    }
  }
  lineHasWidget(e) {
    let t = (i) => i.isWidget() || i.children.some(t);
    return t(this.tile.resolveBlock(e, 1).tile);
  }
  destroy() {
    Mo(this.tile);
  }
}
function Mo(n, e) {
  let t = e?.get(n);
  if (t != 1) {
    t == null && n.destroy();
    for (let i of n.children)
      Mo(i, e);
  }
}
function gm(n) {
  return n.node.nodeType == 1 && n.node.firstChild && (n.offset == 0 || n.node.childNodes[n.offset - 1].contentEditable == "false") && (n.offset == n.node.childNodes.length || n.node.childNodes[n.offset].contentEditable == "false");
}
function Bc(n, e) {
  let t = n.observer.selectionRange;
  if (!t.focusNode)
    return null;
  let i = xc(t.focusNode, t.focusOffset), r = Pc(t.focusNode, t.focusOffset), s = i || r;
  if (r && i && r.node != i.node) {
    let l = te.get(r.node);
    if (!l || l.isText() && l.text != r.node.nodeValue)
      s = r;
    else if (n.docView.lastCompositionAfterCursor) {
      let a = te.get(i.node);
      !a || a.isText() && a.text != i.node.nodeValue || (s = r);
    }
  }
  if (n.docView.lastCompositionAfterCursor = s != i, !s)
    return null;
  let o = e - s.offset;
  return { from: o, to: o + s.node.nodeValue.length, node: s.node };
}
function Qm(n, e, t) {
  let i = Bc(n, t);
  if (!i)
    return null;
  let { node: r, from: s, to: o } = i, l = r.nodeValue;
  if (/[\n\r]/.test(l) || n.state.doc.sliceString(i.from, i.to) != l)
    return null;
  let a = e.invertedDesc;
  return { range: new _e(a.mapPos(s), a.mapPos(o), s, o), text: r };
}
function Sm(n, e) {
  return n.nodeType != 1 ? 0 : (e && n.childNodes[e - 1].contentEditable == "false" ? 1 : 0) | (e < n.childNodes.length && n.childNodes[e].contentEditable == "false" ? 2 : 0);
}
let bm = class {
  constructor() {
    this.changes = [];
  }
  compareRange(e, t) {
    ki(e, t, this.changes);
  }
  comparePoint(e, t) {
    ki(e, t, this.changes);
  }
  boundChange(e) {
    ki(e, e, this.changes);
  }
};
function ym(n, e, t) {
  let i = new bm();
  return _.compare(n, e, t, i), i.changes;
}
class km {
  constructor() {
    this.changes = [];
  }
  compareRange(e, t) {
    ki(e, t, this.changes);
  }
  comparePoint() {
  }
  boundChange(e) {
    ki(e, e, this.changes);
  }
}
function $m(n, e, t) {
  let i = new km();
  return _.compare(n, e, t, i), i.changes;
}
function xm(n, e) {
  for (let t = n; t && t != e; t = t.assignedSlot || t.parentNode)
    if (t.nodeType == 1 && t.contentEditable == "false")
      return !0;
  return !1;
}
function Pm(n, e) {
  let t = !1;
  return e && n.iterChangedRanges((i, r) => {
    i < e.to && r > e.from && (t = !0);
  }), t;
}
class Ts extends Ut {
  constructor(e) {
    super(), this.height = e;
  }
  toDOM() {
    let e = document.createElement("div");
    return e.className = "cm-gap", this.updateDOM(e), e;
  }
  eq(e) {
    return e.height == this.height;
  }
  updateDOM(e) {
    return e.style.height = this.height + "px", !0;
  }
  get editable() {
    return !0;
  }
  get estimatedHeight() {
    return this.height;
  }
  ignoreEvent() {
    return !1;
  }
}
function wm(n, e, t = 1) {
  let i = n.charCategorizer(e), r = n.doc.lineAt(e), s = e - r.from;
  if (r.length == 0)
    return S.cursor(e);
  s == 0 ? t = 1 : s == r.length && (t = -1);
  let o = s, l = s;
  t < 0 ? o = he(r.text, s, !1) : l = he(r.text, s);
  let a = i(r.text.slice(o, l));
  for (; o > 0; ) {
    let h = he(r.text, o, !1);
    if (i(r.text.slice(h, o)) != a)
      break;
    o = h;
  }
  for (; l < r.length; ) {
    let h = he(r.text, l);
    if (i(r.text.slice(l, h)) != a)
      break;
    l = h;
  }
  return S.undirectionalRange(o + r.from, l + r.from);
}
function vm(n, e, t, i, r) {
  let s = Math.round((i - e.left) * n.defaultCharacterWidth);
  if (n.lineWrapping && t.height > n.defaultLineHeight * 1.5) {
    let l = n.viewState.heightOracle.textHeight, a = Math.floor((r - t.top - (n.defaultLineHeight - l) * 0.5) / l);
    s += a * n.viewState.heightOracle.lineLength;
  }
  let o = n.state.sliceDoc(t.from, t.to);
  return t.from + wo(o, s, n.state.tabSize);
}
function _o(n, e, t) {
  let i = n.lineBlockAt(e);
  if (Array.isArray(i.type)) {
    let r;
    for (let s of i.type) {
      if (s.from > e)
        break;
      if (!(s.to < e)) {
        if (s.from < e && s.to > e)
          return s;
        (!r || s.type == ue.Text && (r.type != s.type || (t < 0 ? s.from < e : s.to > e))) && (r = s);
      }
    }
    return r || i;
  }
  return i;
}
function Tm(n, e, t, i) {
  let r = _o(n, e.head, e.assoc || -1), s = !i || r.type != ue.Text || !(n.lineWrapping || r.widgetLineBreaks) ? null : n.coordsAtPos(e.assoc < 0 && e.head > r.from ? e.head - 1 : e.head);
  if (s) {
    let o = n.dom.getBoundingClientRect(), l = n.textDirectionAt(r.from), a = n.posAtCoords({
      x: t == (l == K.LTR) ? o.right - 1 : o.left + 1,
      y: (s.top + s.bottom) / 2
    });
    if (a != null)
      return S.cursor(a, t ? -1 : 1);
  }
  return S.cursor(t ? r.to : r.from, t ? -1 : 1);
}
function _a(n, e, t, i) {
  let r = n.state.doc.lineAt(e.head), s = n.bidiSpans(r), o = n.textDirectionAt(r.from);
  for (let l = e, a = null; ; ) {
    let h = im(r, s, o, l, t), O = Cc;
    if (!h) {
      if (r.number == (t ? n.state.doc.lines : 1))
        return l;
      O = `
`, r = n.state.doc.line(r.number + (t ? 1 : -1)), s = n.bidiSpans(r), h = t ? S.cursor(r.from, -1) : S.cursor(r.to, 1);
    }
    if (a) {
      if (!a(O))
        return l;
    } else {
      if (!i)
        return h;
      a = i(O);
    }
    l = h;
  }
}
function Xm(n, e, t) {
  let i = n.state.charCategorizer(e), r = i(t);
  return (s) => {
    let o = i(s);
    return r == J.Space && (r = o), r == o;
  };
}
function Cm(n, e, t, i) {
  let r = e.head, s = t ? 1 : -1;
  if (r == (t ? n.state.doc.length : 0))
    return S.cursor(r, e.assoc);
  let o = e.goalColumn, l, a = n.contentDOM.getBoundingClientRect(), h = n.coordsAtPos(r, e.assoc || ((e.empty ? t : e.head == e.from) ? 1 : -1)), O = n.documentTop;
  if (h)
    o == null && (o = h.left - a.left), l = s < 0 ? h.top : h.bottom;
  else {
    let d = n.viewState.lineBlockAt(r);
    o == null && (o = Math.min(a.right - a.left, n.defaultCharacterWidth * (r - d.from))), l = (s < 0 ? d.top : d.bottom) + O;
  }
  let c = a.left + o, f = n.viewState.heightOracle.textHeight >> 1, u = i ?? f;
  for (let d = 0; ; d += f) {
    let p = l + (u + d) * s, g = Eo(n, { x: c, y: p }, !1, s);
    if (t ? p > a.bottom : p < a.top)
      return S.cursor(g.pos, g.assoc);
    let Q = n.coordsAtPos(g.pos, g.assoc), b = Q ? (Q.top + Q.bottom) / 2 : 0;
    if (!Q || (t ? b > l : b < l))
      return S.cursor(g.pos, g.assoc, void 0, o);
  }
}
function ln(n, e, t) {
  for (; ; ) {
    let i = 0;
    for (let r of n)
      r.between(e - 1, e + 1, (s, o, l) => {
        if (e > s && e < o) {
          let a = i || t || (e - s < o - e ? -1 : 1);
          e = a < 0 ? s : o, i = a;
        }
      });
    if (!i)
      return e;
  }
}
function Ic(n, e) {
  let t = null;
  for (let i = 0; i < e.ranges.length; i++) {
    let r = e.ranges[i], s = null;
    if (r.empty) {
      let o = ln(n, r.from, 0);
      o != r.from && (s = S.cursor(o, -1));
    } else {
      let o = ln(n, r.from, -1), l = ln(n, r.to, 1);
      (o != r.from || l != r.to) && (r.undirectional ? s = S.undirectionalRange(r.from, r.to) : s = S.range(r.from == r.anchor ? o : l, r.from == r.head ? o : l));
    }
    s && (t || (t = e.ranges.slice()), t[i] = s);
  }
  return t ? S.create(t, e.mainIndex) : e;
}
function Xs(n, e, t) {
  let i = ln(n.state.facet(Rn).map((r) => r(n)), t.from, e.head > t.from ? -1 : 1);
  return i == t.from ? t : S.cursor(i, i < t.from ? 1 : -1);
}
class rt {
  constructor(e, t) {
    this.pos = e, this.assoc = t;
  }
}
function Eo(n, e, t, i) {
  let r = n.contentDOM.getBoundingClientRect(), s = r.top + n.viewState.paddingTop, { x: o, y: l } = e, a = l - s, h;
  for (; ; ) {
    if (a < 0)
      return new rt(0, 1);
    if (a > n.viewState.docHeight)
      return new rt(n.state.doc.length, -1);
    if (h = n.elementAtHeight(a), i == null)
      break;
    if (h.type == ue.Text) {
      if (i < 0 ? h.to < n.viewport.from : h.from > n.viewport.to)
        break;
      let f = n.docView.coordsAt(i < 0 ? h.from : h.to, i > 0 ? -1 : 1);
      if (f && (i < 0 ? f.top <= a + s : f.bottom >= a + s))
        break;
    }
    let c = n.viewState.heightOracle.textHeight / 2;
    a = i > 0 ? h.bottom + c : h.top - c;
  }
  if (n.viewport.from >= h.to || n.viewport.to <= h.from) {
    if (t)
      return null;
    if (h.type == ue.Text) {
      let c = vm(n, r, h, o, l);
      return new rt(c, c == h.from ? 1 : -1);
    }
  }
  if (h.type != ue.Text)
    return a < (h.top + h.bottom) / 2 ? new rt(h.from, 1) : new rt(h.to, -1);
  let O = n.docView.lineAt(h.from, 2);
  return (!O || O.length != h.length) && (O = n.docView.lineAt(h.from, -2)), new Zm(n, o, l, n.textDirectionAt(h.from)).scanTile(O, h.from);
}
class Zm {
  constructor(e, t, i, r) {
    this.view = e, this.x = t, this.y = i, this.baseDir = r, this.line = null, this.spans = null;
  }
  bidiSpansAt(e) {
    return (!this.line || this.line.from > e || this.line.to < e) && (this.line = this.view.state.doc.lineAt(e), this.spans = this.view.bidiSpans(this.line)), this;
  }
  baseDirAt(e, t) {
    let { line: i, spans: r } = this.bidiSpansAt(e);
    return r[st.find(r, e - i.from, -1, t)].level == this.baseDir;
  }
  dirAt(e, t) {
    let { line: i, spans: r } = this.bidiSpansAt(e);
    return r[st.find(r, e - i.from, -1, t)].dir;
  }
  // Used to short-circuit bidi tests for content with a uniform direction
  bidiIn(e, t) {
    let { spans: i, line: r } = this.bidiSpansAt(e);
    return i.length > 1 || i.length && (i[0].level != this.baseDir || i[0].to + r.from < t);
  }
  // Scan through the rectangles for the content of a tile with inline
  // content, looking for one that overlaps the queried position
  // vertically and is closest horizontally. The caller is responsible
  // for dividing its content into N pieces, and pass an array with
  // N+1 positions (including the position after the last piece). For
  // a text tile, these will be character clusters, for a composite
  // tile, these will be child tiles.
  scan(e, t, i = !1) {
    let r = 0, s = e.length - 1, o = /* @__PURE__ */ new Set(), l = this.bidiIn(e[0], e[s]), a, h, O = -1, c = 1e9, f;
    e: for (; r < s; ) {
      let d = s - r, p = r + s >> 1;
      t: if (o.has(p)) {
        for (let b = 1; b < d; b++) {
          let y = p + b;
          if (y >= s && (y -= d), !o.has(y)) {
            p = y;
            break t;
          }
        }
        break e;
      }
      o.add(p);
      let g = t(p), Q = 0;
      if (g)
        for (let b = 0; b < g.length; b++) {
          let y = g[b];
          if (!(y.width == 0 && g.length > 1))
            if (y.bottom < this.y)
              (!a || a.bottom < y.bottom) && (a = y), Q = 1;
            else if (y.top > this.y)
              (!h || h.top > y.top) && (h = y), Q = -1;
            else {
              let C = y.left > this.x ? this.x - y.left : y.right < this.x ? this.x - y.right : 0, k = Math.abs(C);
              k < c && (O = p, c = k, f = y), C && (Q = C < 0 == (this.baseDir == K.LTR) ? -1 : 1);
            }
        }
      Q == -1 && (!l || this.baseDirAt(e[p], 1)) ? s = p : Q == 1 && (!l || this.baseDirAt(e[p + 1], -1)) && (r = p + 1);
    }
    if (!f) {
      if (!h && !a)
        return { i: 0, after: !1 };
      let d = a && (!h || this.y - a.bottom < h.top - this.y) ? a : h;
      return this.y = (d.top + d.bottom) / 2, this.scan(e, t, !0);
    }
    if (c && !i) {
      let { top: d, bottom: p } = f;
      if (a && a.bottom > (d + d + p) / 3)
        return this.y = a.bottom - 1, this.scan(e, t, !0);
      if (h && h.top < (d + p + p) / 3)
        return this.y = h.top + 1, this.scan(e, t, !0);
    }
    let u = (l ? this.dirAt(e[O], 1) : this.baseDir) == K.LTR;
    return {
      i: O,
      // Test whether x is closes to the start or end of this element
      after: this.x > (f.left + f.right) / 2 == u
    };
  }
  scanText(e, t) {
    let i = [];
    for (let s = 0; s < e.length; s = he(e.text, s))
      i.push(t + s);
    i.push(t + e.length);
    let r = this.scan(i, (s) => {
      let o = i[s] - t, l = i[s + 1] - t;
      return gn(e.dom, o, l).getClientRects();
    });
    return r.after ? new rt(i[r.i + 1], -1) : new rt(i[r.i], 1);
  }
  scanTile(e, t) {
    if (!e.length)
      return new rt(t, 1);
    if (e.children.length == 1) {
      let l = e.children[0];
      if (l.isText())
        return this.scanText(l, t);
      if (l.isComposite())
        return this.scanTile(l, t);
    }
    let i = [t];
    for (let l = 0, a = t; l < e.children.length; l++)
      i.push(a += e.children[l].length);
    let r = this.scan(i, (l) => {
      let a = e.children[l];
      return a.flags & 48 ? null : (a.dom.nodeType == 1 ? a.dom : gn(a.dom, 0, a.length)).getClientRects();
    }), s = e.children[r.i], o = i[r.i];
    return s.isText() ? this.scanText(s, o) : s.isComposite() ? this.scanTile(s, o) : r.after ? new rt(i[r.i + 1], -1) : new rt(o, 1);
  }
}
const pi = "￿";
class Rm {
  constructor(e, t) {
    this.points = e, this.view = t, this.text = "", this.lineSeparator = t.state.facet(D.lineSeparator);
  }
  append(e) {
    this.text += e;
  }
  lineBreak() {
    this.text += pi;
  }
  readRange(e, t) {
    if (!e)
      return this;
    let i = e.parentNode;
    for (let r = e; ; ) {
      this.findPointBefore(i, r);
      let s = this.text.length;
      this.readNode(r);
      let o = te.get(r), l = r.nextSibling;
      if (l == t) {
        o?.breakAfter && !l && i != this.view.contentDOM && this.lineBreak();
        break;
      }
      let a = te.get(l);
      (o && a ? o.breakAfter : (o ? o.breakAfter : Pr(r)) || Pr(l) && (r.nodeName != "BR" || o?.isWidget()) && this.text.length > s) && !qm(l, t) && this.lineBreak(), r = l;
    }
    return this.findPointBefore(i, t), this;
  }
  readTextNode(e) {
    let t = e.nodeValue;
    for (let i of this.points)
      i.node == e && (i.pos = this.text.length + Math.min(i.offset, t.length));
    for (let i = 0, r = this.lineSeparator ? null : /\r\n?|\n/g; ; ) {
      let s = -1, o = 1, l;
      if (this.lineSeparator ? (s = t.indexOf(this.lineSeparator, i), o = this.lineSeparator.length) : (l = r.exec(t)) && (s = l.index, o = l[0].length), this.append(t.slice(i, s < 0 ? t.length : s)), s < 0)
        break;
      if (this.lineBreak(), o > 1)
        for (let a of this.points)
          a.node == e && a.pos > this.text.length && (a.pos -= o - 1);
      i = s + o;
    }
  }
  readNode(e) {
    let t = te.get(e), i = t && t.overrideDOMText;
    if (i != null) {
      this.findPointInside(e, i.length);
      for (let r = i.iter(); !r.next().done; )
        r.lineBreak ? this.lineBreak() : this.append(r.value);
    } else e.nodeType == 3 ? this.readTextNode(e) : e.nodeName == "BR" ? e.nextSibling && this.lineBreak() : e.nodeType == 1 && this.readRange(e.firstChild, null);
  }
  findPointBefore(e, t) {
    for (let i of this.points)
      i.node == e && e.childNodes[i.offset] == t && (i.pos = this.text.length);
  }
  findPointInside(e, t) {
    for (let i of this.points)
      (e.nodeType == 3 ? i.node == e : e.contains(i.node)) && (i.pos = this.text.length + (Am(e, i.node, i.offset) ? t : 0));
  }
}
function Am(n, e, t) {
  for (; ; ) {
    if (!e || t < kt(e))
      return !1;
    if (e == n)
      return !0;
    t = Mt(e) + 1, e = e.parentNode;
  }
}
function qm(n, e) {
  let t;
  for (; !(n == e || !n); n = n.nextSibling) {
    let i = te.get(n);
    if (!i?.isWidget())
      return !1;
    i && (t || (t = [])).push(i);
  }
  if (t)
    for (let i of t) {
      let r = i.overrideDOMText;
      if (r?.length)
        return !1;
    }
  return !0;
}
class Ea {
  constructor(e, t) {
    this.node = e, this.offset = t, this.pos = -1;
  }
}
class jm {
  constructor(e, t, i, r) {
    this.typeOver = r, this.bounds = null, this.text = "", this.domChanged = t > -1;
    let { impreciseHead: s, impreciseAnchor: o } = e.docView, l = e.state.selection;
    if (e.state.readOnly && t > -1)
      this.newSel = null;
    else if (t > -1 && (this.bounds = Gc(e.docView.tile, t, i, 0))) {
      let a = s || o ? [] : zm(e), h = new Rm(a, e);
      h.readRange(this.bounds.startDOM, this.bounds.endDOM), this.text = h.text, this.newSel = Mm(a, this.bounds.from);
    } else {
      let a = e.observer.selectionRange, h = s && s.node == a.focusNode && s.offset == a.focusOffset || !Ao(e.contentDOM, a.focusNode) ? l.main.head : e.docView.posFromDOM(a.focusNode, a.focusOffset), O = o && o.node == a.anchorNode && o.offset == a.anchorOffset || !Ao(e.contentDOM, a.anchorNode) ? l.main.anchor : e.docView.posFromDOM(a.anchorNode, a.anchorOffset), c = e.viewport;
      if ((v.ios || v.chrome) && h != O && Math.min(h, O) <= l.main.from && Math.max(h, O) >= l.main.to && (c.from > 0 || c.to < e.state.doc.length)) {
        let f = Math.min(h, O), u = Math.max(h, O), d = c.from - f, p = c.to - u;
        (d == 0 || d == 1 || f == 0) && (p == 0 || p == -1 || u == e.state.doc.length) && (h = 0, O = e.state.doc.length);
      }
      if (e.inputState.composing > -1 && l.ranges.length > 1)
        this.newSel = l.replaceRange(S.range(O, h));
      else if (e.lineWrapping && O == h && !(l.main.empty && l.main.head == h) && e.inputState.lastTouchTime > Date.now() - 100) {
        let f = e.coordsAtPos(h, -1), u = 0;
        f && (u = e.inputState.lastTouchY <= f.bottom ? -1 : 1), this.newSel = S.create([S.cursor(h, u)]);
      } else
        this.newSel = S.single(O, h);
    }
  }
}
function Gc(n, e, t, i) {
  if (n.isComposite()) {
    let r = -1, s = -1, o = -1, l = -1;
    for (let a = 0, h = i, O = i; a < n.children.length; a++) {
      let c = n.children[a], f = h + c.length;
      if (h < e && f > t)
        return Gc(c, e, t, h);
      if (f >= e && r == -1 && (r = a, s = h), h > t && c.dom.parentNode == n.dom) {
        o = a, l = O;
        break;
      }
      O = f, h = f + c.breakAfter;
    }
    return {
      from: s,
      to: l < 0 ? i + n.length : l,
      startDOM: (r ? n.children[r - 1].dom.nextSibling : null) || n.dom.firstChild,
      endDOM: o < n.children.length && o >= 0 ? n.children[o].dom : null
    };
  } else return n.isText() ? { from: i, to: i + n.length, startDOM: n.dom, endDOM: n.dom.nextSibling } : null;
}
function Nc(n, e) {
  let t, { newSel: i } = e, { state: r } = n, s = r.selection.main, o = n.inputState.lastKeyTime > Date.now() - 100 ? n.inputState.lastKeyCode : -1;
  if (e.bounds) {
    let { from: l, to: a } = e.bounds, h = s.from, O = null;
    (o === 8 || v.android && e.text.length < a - l) && (h = s.to, O = "end");
    let c = r.doc.sliceString(l, a, pi), f, u;
    !s.empty && s.from >= l && s.to <= a && (e.typeOver || c != e.text) && c.slice(0, s.from - l) == e.text.slice(0, s.from - l) && c.slice(s.to - l) == e.text.slice(f = e.text.length - (c.length - (s.to - l))) ? t = {
      from: s.from,
      to: s.to,
      insert: Y.of(e.text.slice(s.from - l, f).split(pi))
    } : (u = Fc(c, e.text, h - l, O)) && (v.chrome && o == 13 && u.toB == u.from + 2 && e.text.slice(u.from, u.toB) == pi + pi && u.toB--, t = {
      from: l + u.from,
      to: l + u.toA,
      insert: Y.of(e.text.slice(u.from, u.toB).split(pi))
    });
  } else i && (!n.hasFocus && r.facet(St) || Xr(i, s)) && (i = null);
  if (!t && !i)
    return !1;
  if ((v.mac || v.android) && t && t.from == t.to && t.from == s.head - 1 && /^\. ?$/.test(t.insert.toString()) && n.contentDOM.getAttribute("autocorrect") == "off" ? (i && t.insert.length == 2 && (i = S.single(i.main.anchor - 1, i.main.head - 1)), t = { from: t.from, to: t.to, insert: Y.of([t.insert.toString().replace(".", " ")]) }) : r.doc.lineAt(s.from).to < s.to && n.docView.lineHasWidget(s.to) && n.inputState.insertingTextAt > Date.now() - 50 ? t = {
    from: s.from,
    to: s.to,
    insert: r.toText(n.inputState.insertingText)
  } : v.chrome && t && t.from == t.to && t.from == s.head && t.insert.toString() == `
 ` && n.lineWrapping && (i && (i = S.single(i.main.anchor - 1, i.main.head - 1)), t = { from: s.from, to: s.to, insert: Y.of([" "]) }), t)
    return Tl(n, t, i, o);
  if (i && !Xr(i, s)) {
    let l = !1, a = "select";
    return n.inputState.lastSelectionTime > Date.now() - 50 && (n.inputState.lastSelectionOrigin == "select" && (l = !0), a = n.inputState.lastSelectionOrigin, a == "select.pointer" && (i = Ic(r.facet(Rn).map((h) => h(n)), i))), n.dispatch({ selection: i, scrollIntoView: l, userEvent: a }), !0;
  } else
    return !1;
}
function Tl(n, e, t, i = -1) {
  if (v.ios && n.inputState.flushIOSKey(e))
    return !0;
  let r = n.state.selection.main;
  if (v.android && (e.to == r.to && // GBoard will sometimes remove a space it just inserted
  // after a completion when you press enter
  (e.from == r.from || e.from == r.from - 1 && n.state.sliceDoc(e.from, r.from) == " ") && e.insert.length == 1 && e.insert.lines == 2 && $i(n.contentDOM, "Enter", 13) || (e.from == r.from - 1 && e.to == r.to && e.insert.length == 0 || i == 8 && e.insert.length < e.to - e.from && e.to > r.head) && $i(n.contentDOM, "Backspace", 8) || e.from == r.from && e.to == r.to + 1 && e.insert.length == 0 && $i(n.contentDOM, "Delete", 46)))
    return !0;
  let s = e.insert.toString();
  n.inputState.composing >= 0 && n.inputState.composing++;
  let o, l = () => o || (o = Wm(n, e, t));
  return n.state.facet(jc).some((a) => a(n, e.from, e.to, s, l)) || n.dispatch(l()), !0;
}
function Wm(n, e, t) {
  let i, r = n.state, s = r.selection.main, o = -1;
  if (e.from == e.to && e.from < s.from || e.from > s.to) {
    let a = e.from < s.from ? -1 : 1, h = a < 0 ? s.from : s.to, O = ln(r.facet(Rn).map((c) => c(n)), h, a);
    e.from == O && (o = O);
  }
  if (o > -1)
    i = {
      changes: e,
      selection: S.cursor(e.from + e.insert.length, -1)
    };
  else if (e.from >= s.from && e.to <= s.to && e.to - e.from >= (s.to - s.from) / 3 && (!t || t.main.empty && t.main.from == e.from + e.insert.length) && n.inputState.composing < 0) {
    let a = s.from < e.from ? r.sliceDoc(s.from, e.from) : "", h = s.to > e.to ? r.sliceDoc(e.to, s.to) : "";
    i = r.replaceSelection(n.state.toText(a + e.insert.sliceString(0, void 0, n.state.lineBreak) + h));
  } else {
    let a = r.changes(e), h = t && t.main.to <= a.newLength ? t.main : void 0;
    if (r.selection.ranges.length > 1 && (n.inputState.composing >= 0 || n.inputState.compositionPendingChange) && e.to <= s.to + 10 && e.to >= s.to - 10) {
      let O = n.state.sliceDoc(e.from, e.to), c, f = t && Bc(n, t.main.head);
      if (f) {
        let d = e.insert.length - (e.to - e.from);
        c = { from: f.from, to: f.to - d };
      } else
        c = n.state.doc.lineAt(s.head);
      let u = s.to - e.to;
      i = r.changeByRange((d) => {
        if (d.from == s.from && d.to == s.to)
          return { changes: a, range: h || d.map(a) };
        let p = d.to - u, g = p - O.length;
        if (n.state.sliceDoc(g, p) != O || // Unfortunately, there's no way to make multiple
        // changes in the same node work without aborting
        // composition, so cursors in the composition range are
        // ignored.
        p >= c.from && g <= c.to)
          return { range: d };
        let Q = r.changes({ from: g, to: p, insert: e.insert }), b = d.to - s.to;
        return {
          changes: Q,
          range: h ? S.range(Math.max(0, h.anchor + b), Math.max(0, h.head + b)) : d.map(Q)
        };
      });
    } else
      i = {
        changes: a,
        selection: h && r.selection.replaceRange(h)
      };
  }
  let l = "input.type";
  return (n.composing || n.inputState.compositionPendingChange && n.inputState.compositionEndedAt > Date.now() - 50) && (n.inputState.compositionPendingChange = !1, l += ".compose", n.inputState.compositionFirstChange && (l += ".start", n.inputState.compositionFirstChange = !1)), r.update(i, { userEvent: l, scrollIntoView: !0 });
}
function Fc(n, e, t, i) {
  let r = Math.min(n.length, e.length), s = 0;
  for (; s < r && n.charCodeAt(s) == e.charCodeAt(s); )
    s++;
  if (s == r && n.length == e.length)
    return null;
  let o = n.length, l = e.length;
  for (; o > 0 && l > 0 && n.charCodeAt(o - 1) == e.charCodeAt(l - 1); )
    o--, l--;
  if (i == "end") {
    let a = Math.max(0, s - Math.min(o, l));
    t -= o + a - s;
  }
  if (o < s && n.length < e.length) {
    let a = t <= s && t >= o ? s - t : 0;
    s -= a, l = s + (l - o), o = s;
  } else if (l < s) {
    let a = t <= s && t >= l ? s - t : 0;
    s -= a, o = s + (o - l), l = s;
  }
  return { from: s, toA: o, toB: l };
}
function zm(n) {
  let e = [];
  if (n.root.activeElement != n.contentDOM)
    return e;
  let { anchorNode: t, anchorOffset: i, focusNode: r, focusOffset: s } = n.observer.selectionRange;
  return t && (e.push(new Ea(t, i)), (r != t || s != i) && e.push(new Ea(r, s))), e;
}
function Mm(n, e) {
  if (n.length == 0)
    return null;
  let t = n[0].pos, i = n.length == 2 ? n[1].pos : t;
  return t < 0 || i < 0 ? null : t == i ? S.create([S.cursor(i + e, -1)]) : S.single(t + e, i + e);
}
function Xr(n, e) {
  return e.head == n.main.head && e.anchor == n.main.anchor;
}
class _m {
  setSelectionOrigin(e) {
    this.lastSelectionOrigin = e, this.lastSelectionTime = Date.now();
  }
  constructor(e) {
    this.view = e, this.lastKeyCode = 0, this.lastKeyTime = 0, this.touchActive = !1, this.lastTouchTime = 0, this.lastTouchX = 0, this.lastTouchY = 0, this.lastFocusTime = 0, this.lastScrollTop = 0, this.lastScrollLeft = 0, this.lastWheelEvent = 0, this.pendingIOSKey = void 0, this.lastIOSMomentumScroll = 0, this.tabFocusMode = -1, this.lastSelectionOrigin = null, this.lastSelectionTime = 0, this.lastContextMenu = 0, this.scrollHandlers = [], this.handlers = /* @__PURE__ */ Object.create(null), this.composing = -1, this.compositionFirstChange = null, this.compositionEndedAt = 0, this.compositionPendingKey = !1, this.compositionPendingChange = !1, this.insertingText = "", this.insertingTextAt = 0, this.mouseSelection = null, this.draggedContent = null, this.handleEvent = this.handleEvent.bind(this), this.notifiedFocused = e.hasFocus, v.safari && e.contentDOM.addEventListener("input", () => null), v.gecko && tg(e.contentDOM.ownerDocument);
  }
  handleEvent(e) {
    !Gm(this.view, e) || this.ignoreDuringComposition(e) || e.type == "keydown" && this.keydown(e) || (this.view.updateState != 0 ? Promise.resolve().then(() => this.runHandlers(e.type, e)) : this.runHandlers(e.type, e));
  }
  runHandlers(e, t) {
    let i = this.handlers[e];
    if (i) {
      for (let r of i.observers)
        r(this.view, t);
      for (let r of i.handlers) {
        if (t.defaultPrevented)
          break;
        if (r(this.view, t)) {
          t.preventDefault();
          break;
        }
      }
    }
  }
  ensureHandlers(e) {
    let t = Lm(e), i = this.handlers, r = this.view.contentDOM;
    for (let s in t)
      if (s != "scroll") {
        let o = !t[s].handlers.length, l = i[s];
        l && o != !l.handlers.length && (r.removeEventListener(s, this.handleEvent), l = null), l || r.addEventListener(s, this.handleEvent, { passive: o });
      }
    for (let s in i)
      s != "scroll" && !t[s] && r.removeEventListener(s, this.handleEvent);
    this.handlers = t;
  }
  keydown(e) {
    if (this.lastKeyCode = e.keyCode, this.lastKeyTime = Date.now(), e.keyCode == 9 && this.tabFocusMode > -1 && (!this.tabFocusMode || Date.now() <= this.tabFocusMode))
      return !0;
    if (this.tabFocusMode > 0 && e.keyCode != 27 && Kc.indexOf(e.keyCode) < 0 && (this.tabFocusMode = -1), v.android && v.chrome && !e.synthetic && (e.keyCode == 13 || e.keyCode == 8))
      return this.view.observer.delayAndroidKey(e.key, e.keyCode), !0;
    if (v.ios && !e.synthetic && !e.altKey && !e.metaKey && (Hc.some((t) => t.keyCode == e.keyCode) && !e.ctrlKey || Ym.indexOf(e.key) > -1 && e.ctrlKey)) {
      let t = { ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey };
      t.shiftKey && v.ios && !/^(off|none)$/.test(this.view.contentDOM.autocapitalize) && Em(this.view.win) && (t.shiftKey = !1);
      let i = this.pendingIOSKey = { key: e.key, keyCode: e.keyCode, mods: t };
      return setTimeout(() => {
        this.pendingIOSKey == i && this.flushIOSKey();
      }, 50), !0;
    }
    return e.keyCode != 229 && this.view.observer.forceFlush(), !1;
  }
  flushIOSKey(e) {
    let t = this.pendingIOSKey;
    return !t || this.view.observer.pendingRecords().length || t.key == "Enter" && e && e.from < e.to && /^\S+$/.test(e.insert.toString()) ? !1 : (this.pendingIOSKey = void 0, $i(this.view.contentDOM, t.key, t.keyCode, t.mods));
  }
  ignoreDuringComposition(e) {
    return !/^key/.test(e.type) || e.synthetic ? !1 : this.composing > 0 ? !0 : v.safari && !v.ios && this.compositionPendingKey && Date.now() - this.compositionEndedAt < 100 ? (this.compositionPendingKey = !1, !0) : !1;
  }
  startMouseSelection(e) {
    this.mouseSelection && this.mouseSelection.destroy(), this.mouseSelection = e;
  }
  update(e) {
    this.view.observer.update(e), this.mouseSelection && this.mouseSelection.update(e), this.draggedContent && e.docChanged && (this.draggedContent = this.draggedContent.map(e.changes)), e.transactions.length && (this.lastKeyCode = this.lastSelectionTime = 0);
  }
  destroy() {
    this.mouseSelection && this.mouseSelection.destroy();
  }
}
function Em(n) {
  return n.visualViewport ? n.visualViewport.height * n.visualViewport.scale / n.document.documentElement.clientHeight < 0.85 : !1;
}
function La(n, e) {
  return (t, i) => {
    try {
      return e.call(n, i, t);
    } catch (r) {
      je(t.state, r);
    }
  };
}
function Lm(n) {
  let e = /* @__PURE__ */ Object.create(null);
  function t(i) {
    return e[i] || (e[i] = { observers: [], handlers: [] });
  }
  for (let i of n) {
    let r = i.spec, s = r && r.plugin.domEventHandlers, o = r && r.plugin.domEventObservers;
    if (s)
      for (let l in s) {
        let a = s[l];
        a && t(l).handlers.push(La(i.value, a));
      }
    if (o)
      for (let l in o) {
        let a = o[l];
        a && t(l).observers.push(La(i.value, a));
      }
  }
  for (let i in Ie)
    t(i).handlers.push(Ie[i]);
  for (let i in ke)
    t(i).observers.push(ke[i]);
  return e;
}
const Hc = [
  { key: "Backspace", keyCode: 8, inputType: "deleteContentBackward" },
  { key: "Enter", keyCode: 13, inputType: "insertParagraph" },
  { key: "Enter", keyCode: 13, inputType: "insertLineBreak" },
  { key: "Delete", keyCode: 46, inputType: "deleteContentForward" }
], Ym = "dthko", Kc = [16, 17, 18, 20, 91, 92, 224, 225], Vn = 6;
function Un(n) {
  return Math.max(0, n) * 0.7 + 8;
}
function Vm(n, e) {
  return Math.max(Math.abs(n.clientX - e.clientX), Math.abs(n.clientY - e.clientY));
}
class Um {
  constructor(e, t, i, r) {
    this.view = e, this.startEvent = t, this.style = i, this.mustSelect = r, this.scrollSpeed = { x: 0, y: 0 }, this.scrolling = -1, this.lastEvent = t, this.scrollParents = Sc(e.contentDOM), this.atoms = e.state.facet(Rn).map((o) => o(e));
    let s = e.contentDOM.ownerDocument;
    s.addEventListener("mousemove", this.move = this.move.bind(this)), s.addEventListener("mouseup", this.up = this.up.bind(this)), this.extend = t.shiftKey, this.multiple = e.state.facet(D.allowMultipleSelections) && Dm(e, t), this.dragging = Im(e, t) && tf(t) == 1 ? null : !1;
  }
  start(e) {
    this.dragging === !1 && this.select(e);
  }
  move(e) {
    if (e.buttons == 0)
      return this.destroy();
    if (this.dragging || this.dragging == null && Vm(this.startEvent, e) < 10)
      return;
    this.select(this.lastEvent = e);
    let t = 0, i = 0, r = 0, s = 0, o = this.view.win.innerWidth, l = this.view.win.innerHeight;
    this.scrollParents.x && ({ left: r, right: o } = this.scrollParents.x.getBoundingClientRect()), this.scrollParents.y && ({ top: s, bottom: l } = this.scrollParents.y.getBoundingClientRect());
    let a = vl(this.view);
    e.clientX - a.left <= r + Vn ? t = -Un(r - e.clientX) : e.clientX + a.right >= o - Vn && (t = Un(e.clientX - o)), e.clientY - a.top <= s + Vn ? i = -Un(s - e.clientY) : e.clientY + a.bottom >= l - Vn && (i = Un(e.clientY - l)), this.setScrollSpeed(t, i);
  }
  up(e) {
    this.dragging == null && this.select(this.lastEvent), this.dragging || e.preventDefault(), this.destroy();
  }
  destroy() {
    this.setScrollSpeed(0, 0);
    let e = this.view.contentDOM.ownerDocument;
    e.removeEventListener("mousemove", this.move), e.removeEventListener("mouseup", this.up), this.view.inputState.mouseSelection = this.view.inputState.draggedContent = null;
  }
  setScrollSpeed(e, t) {
    this.scrollSpeed = { x: e, y: t }, e || t ? this.scrolling < 0 && (this.scrolling = setInterval(() => this.scroll(), 50)) : this.scrolling > -1 && (clearInterval(this.scrolling), this.scrolling = -1);
  }
  scroll() {
    let { x: e, y: t } = this.scrollSpeed;
    e && this.scrollParents.x && (this.scrollParents.x.scrollLeft += e, e = 0), t && this.scrollParents.y && (this.scrollParents.y.scrollTop += t, t = 0), (e || t) && this.view.win.scrollBy(e, t), this.dragging === !1 && this.select(this.lastEvent);
  }
  select(e) {
    let { view: t } = this, i = Ic(this.atoms, this.style.get(e, this.extend, this.multiple));
    (this.mustSelect || !i.eq(t.state.selection, this.dragging === !1)) && this.view.dispatch({
      selection: i,
      userEvent: "select.pointer"
    }), this.mustSelect = !1;
  }
  update(e) {
    e.transactions.some((t) => t.isUserEvent("input.type")) ? this.destroy() : this.style.update(e) && setTimeout(() => this.select(this.lastEvent), 20);
  }
}
function Dm(n, e) {
  let t = n.state.facet(Zc);
  return t.length ? t[0](e) : v.mac ? e.metaKey : e.ctrlKey;
}
function Bm(n, e) {
  let t = n.state.facet(Rc);
  return t.length ? t[0](e) : v.mac ? !e.altKey : !e.ctrlKey;
}
function Im(n, e) {
  let { main: t } = n.state.selection;
  if (t.empty)
    return !1;
  let i = pn(n.root);
  if (!i || i.rangeCount == 0)
    return !0;
  let r = i.getRangeAt(0).getClientRects();
  for (let s = 0; s < r.length; s++) {
    let o = r[s];
    if (o.left <= e.clientX && o.right >= e.clientX && o.top <= e.clientY && o.bottom >= e.clientY)
      return !0;
  }
  return !1;
}
function Gm(n, e) {
  if (!e.bubbles)
    return !0;
  if (e.defaultPrevented)
    return !1;
  for (let t = e.target, i; t != n.contentDOM; t = t.parentNode)
    if (!t || t.nodeType == 11 || (i = te.get(t)) && i.isWidget() && !i.isHidden && i.widget.ignoreEvent(e))
      return !1;
  return !0;
}
const Ie = /* @__PURE__ */ Object.create(null), ke = /* @__PURE__ */ Object.create(null), Jc = v.ie && v.ie_version < 15 || v.ios && v.webkit_version < 604;
function Nm(n) {
  let e = n.dom.parentNode;
  if (!e)
    return;
  let t = e.appendChild(document.createElement("textarea"));
  t.style.cssText = "position: fixed; left: -10000px; top: 10px", t.focus(), setTimeout(() => {
    n.focus(), t.remove(), ef(n, t.value);
  }, 50);
}
function os(n, e, t) {
  for (let i of n.facet(e))
    t = i(t, n);
  return t;
}
function ef(n, e) {
  e = os(n.state, $l, e);
  let { state: t } = n, i, r = 1, s = t.toText(e), o = s.lines == t.selection.ranges.length;
  if (Lo != null && t.selection.ranges.every((a) => a.empty) && Lo == s.toString()) {
    let a = -1;
    i = t.changeByRange((h) => {
      let O = t.doc.lineAt(h.from);
      if (O.from == a)
        return { range: h };
      a = O.from;
      let c = t.toText((o ? s.line(r++).text : e) + t.lineBreak);
      return {
        changes: { from: O.from, insert: c },
        range: S.cursor(h.from + c.length, -1)
      };
    });
  } else o ? i = t.changeByRange((a) => {
    let h = s.line(r++);
    return {
      changes: { from: a.from, to: a.to, insert: h.text },
      range: S.cursor(a.from + h.length, -1)
    };
  }) : i = t.replaceSelection(s);
  n.dispatch(i, {
    userEvent: "input.paste",
    scrollIntoView: !0
  });
}
ke.scroll = (n) => {
  let e = n.inputState;
  e.lastScrollTop = n.scrollDOM.scrollTop, e.lastScrollLeft = n.scrollDOM.scrollLeft, v.ios && !e.touchActive && (e.lastIOSMomentumScroll = Date.now());
};
ke.wheel = ke.mousewheel = (n) => {
  n.inputState.lastWheelEvent = Date.now();
};
Ie.keydown = (n, e) => (n.inputState.setSelectionOrigin("select"), e.keyCode == 27 && n.inputState.tabFocusMode != 0 && (n.inputState.tabFocusMode = Date.now() + 2e3), !1);
ke.touchstart = (n, e) => {
  let t = n.inputState, i = e.targetTouches[0];
  t.touchActive = !0, t.lastTouchTime = Date.now(), i && (t.lastTouchX = i.clientX, t.lastTouchY = i.clientY), t.setSelectionOrigin("select.pointer");
};
ke.touchmove = (n) => {
  n.inputState.setSelectionOrigin("select.pointer");
};
ke.touchend = (n, e) => {
  n.inputState.touchActive = !1;
};
Ie.mousedown = (n, e) => {
  if (n.observer.flush(), n.inputState.lastTouchTime > Date.now() - 2e3)
    return !1;
  let t = null;
  for (let i of n.state.facet(Ac))
    if (t = i(n, e), t)
      break;
  if (!t && e.button == 0 && (t = Hm(n, e)), t) {
    let i = !n.hasFocus;
    n.inputState.startMouseSelection(new Um(n, e, t, i)), i && n.observer.ignore(() => {
      kc(n.contentDOM);
      let s = n.root.activeElement;
      s && !s.contains(n.contentDOM) && s.blur();
    });
    let r = n.inputState.mouseSelection;
    if (r)
      return r.start(e), r.dragging === !1;
  } else
    n.inputState.setSelectionOrigin("select.pointer");
  return !1;
};
function Ya(n, e, t, i) {
  if (i == 1)
    return S.cursor(e, t);
  if (i == 2)
    return wm(n.state, e, t);
  {
    let r = n.docView.lineAt(e, t), s = n.state.doc.lineAt(r ? r.posAtEnd : e), o = r ? r.posAtStart : s.from, l = r ? r.posAtEnd : s.to;
    return l < n.state.doc.length && l == s.to && l++, S.undirectionalRange(o, l);
  }
}
const Fm = v.ie && v.ie_version <= 11;
let Va = null, Ua = 0, Da = 0;
function tf(n) {
  if (!Fm)
    return n.detail;
  let e = Va, t = Da;
  return Va = n, Da = Date.now(), Ua = !e || t > Date.now() - 400 && Math.abs(e.clientX - n.clientX) < 2 && Math.abs(e.clientY - n.clientY) < 2 ? (Ua + 1) % 3 : 1;
}
function Hm(n, e) {
  let t = n.posAndSideAtCoords({ x: e.clientX, y: e.clientY }, !1), i = tf(e), r = n.state.selection;
  return {
    update(s) {
      s.docChanged && (t.pos = s.changes.mapPos(t.pos), r = r.map(s.changes));
    },
    get(s, o, l) {
      let a = n.posAndSideAtCoords({ x: s.clientX, y: s.clientY }, !1), h, O = Ya(n, a.pos, a.assoc, i);
      if (t.pos != a.pos && !o) {
        let c = Ya(n, t.pos, t.assoc, i), f = Math.min(c.from, O.from), u = Math.max(c.to, O.to);
        O = f < O.from ? S.range(f, u, O.assoc) : S.range(u, f, O.assoc);
      }
      return o ? r.replaceRange(r.main.extend(O.from, O.to, O.assoc)) : l && i == 1 && r.ranges.length > 1 && (h = Km(r, a.pos)) ? h : l ? r.addRange(O) : S.create([O]);
    }
  };
}
function Km(n, e) {
  for (let t = 0; t < n.ranges.length; t++) {
    let { from: i, to: r } = n.ranges[t];
    if (i <= e && r >= e)
      return S.create(n.ranges.slice(0, t).concat(n.ranges.slice(t + 1)), n.mainIndex == t ? 0 : n.mainIndex - (n.mainIndex > t ? 1 : 0));
  }
  return null;
}
Ie.dragstart = (n, e) => {
  let { selection: { main: t } } = n.state;
  if (e.target.draggable) {
    let r = n.docView.tile.nearest(e.target);
    if (r && r.isWidget()) {
      let s = r.posAtStart, o = s + r.length;
      (s >= t.to || o <= t.from) && (t = S.undirectionalRange(s, o));
    }
  }
  let { inputState: i } = n;
  return i.mouseSelection && (i.mouseSelection.dragging = !0), i.draggedContent = t, e.dataTransfer && (e.dataTransfer.setData("Text", os(n.state, xl, n.state.sliceDoc(t.from, t.to))), e.dataTransfer.effectAllowed = "copyMove"), !1;
};
Ie.dragend = (n) => (n.inputState.draggedContent = null, !1);
function Ba(n, e, t, i) {
  if (t = os(n.state, $l, t), !t)
    return;
  let r = n.posAtCoords({ x: e.clientX, y: e.clientY }, !1), { draggedContent: s } = n.inputState, o = i && s && Bm(n, e) ? { from: s.from, to: s.to } : null, l = { from: r, insert: t }, a = n.state.changes(o ? [o, l] : l);
  n.focus(), n.dispatch({
    changes: a,
    selection: { anchor: a.mapPos(r, -1), head: a.mapPos(r, 1) },
    userEvent: o ? "move.drop" : "input.drop"
  }), n.inputState.draggedContent = null;
}
Ie.drop = (n, e) => {
  if (!e.dataTransfer)
    return !1;
  if (n.state.readOnly)
    return !0;
  let t = e.dataTransfer.files;
  if (t && t.length) {
    let i = Array(t.length), r = 0, s = () => {
      ++r == t.length && Ba(n, e, i.filter((o) => o != null).join(n.state.lineBreak), !1);
    };
    for (let o = 0; o < t.length; o++) {
      let l = new FileReader();
      l.onerror = s, l.onload = () => {
        /[\x00-\x08\x0e-\x1f]{2}/.test(l.result) || (i[o] = l.result), s();
      }, l.readAsText(t[o]);
    }
    return !0;
  } else {
    let i = e.dataTransfer.getData("Text");
    if (i)
      return Ba(n, e, i, !0), !0;
  }
  return !1;
};
Ie.paste = (n, e) => {
  if (n.state.readOnly)
    return !0;
  n.observer.flush();
  let t = Jc ? null : e.clipboardData;
  return t ? (ef(n, t.getData("text/plain") || t.getData("text/uri-list")), !0) : (Nm(n), !1);
};
function Jm(n, e) {
  let t = n.dom.parentNode;
  if (!t)
    return;
  let i = t.appendChild(document.createElement("textarea"));
  i.style.cssText = "position: fixed; left: -10000px; top: 10px", i.value = e, i.focus(), i.selectionEnd = e.length, i.selectionStart = 0, setTimeout(() => {
    i.remove(), n.focus();
  }, 50);
}
function eg(n) {
  let e = [], t = [], i = !1;
  for (let r of n.selection.ranges)
    r.empty || (e.push(n.sliceDoc(r.from, r.to)), t.push(r));
  if (!e.length) {
    let r = -1;
    for (let { from: s } of n.selection.ranges) {
      let o = n.doc.lineAt(s);
      o.number > r && (e.push(o.text), t.push({ from: o.from, to: Math.min(n.doc.length, o.to + 1) })), r = o.number;
    }
    i = !0;
  }
  return { text: os(n, xl, e.join(n.lineBreak)), ranges: t, linewise: i };
}
let Lo = null;
Ie.copy = Ie.cut = (n, e) => {
  if (!rn(n.contentDOM, n.observer.selectionRange))
    return !1;
  let { text: t, ranges: i, linewise: r } = eg(n.state);
  if (!t && !r)
    return !1;
  Lo = r ? t : null, e.type == "cut" && !n.state.readOnly && n.dispatch({
    changes: i,
    scrollIntoView: !0,
    userEvent: "delete.cut"
  });
  let s = Jc ? null : e.clipboardData;
  return s ? (s.clearData(), s.setData("text/plain", t), !0) : (Jm(n, t), !1);
};
const nf = /* @__PURE__ */ Pt.define();
function rf(n, e) {
  let t = [];
  for (let i of n.facet(Wc)) {
    let r = i(n, e);
    r && t.push(r);
  }
  return t.length ? n.update({ effects: t, annotations: nf.of(!0) }) : null;
}
function sf(n) {
  setTimeout(() => {
    let e = n.hasFocus;
    if (e != n.inputState.notifiedFocused) {
      let t = rf(n.state, e);
      t ? n.dispatch(t) : n.update([]);
    }
  }, 10);
}
ke.focus = (n) => {
  n.inputState.lastFocusTime = Date.now(), !n.scrollDOM.scrollTop && (n.inputState.lastScrollTop || n.inputState.lastScrollLeft) && (n.scrollDOM.scrollTop = n.inputState.lastScrollTop, n.scrollDOM.scrollLeft = n.inputState.lastScrollLeft), sf(n);
};
ke.blur = (n) => {
  n.observer.clearSelectionRange(), sf(n);
};
ke.compositionstart = ke.compositionupdate = (n) => {
  if (!n.observer.editContext && (n.inputState.compositionFirstChange == null && (n.inputState.compositionFirstChange = !0), n.inputState.composing < 0)) {
    let { main: e } = n.state.selection;
    !e.empty && n.lineBlockAt(e.from).from != n.lineBlockAt(e.to).from && n.dispatch({
      changes: n.state.selection.ranges.filter((t) => !t.empty).map((t) => ({ from: t.from, to: t.to })),
      userEvent: "input"
    }), n.inputState.composing = 0;
  }
};
ke.compositionend = (n) => {
  n.observer.editContext || (n.inputState.composing = -1, n.inputState.compositionEndedAt = Date.now(), n.inputState.compositionPendingKey = !0, n.inputState.compositionPendingChange = n.observer.pendingRecords().length > 0, n.inputState.compositionFirstChange = null, v.chrome && v.android ? n.observer.flushSoon() : n.inputState.compositionPendingChange ? Promise.resolve().then(() => n.observer.flush()) : setTimeout(() => {
    n.inputState.composing < 0 && n.docView.hasComposition && n.update([]);
  }, 50));
};
ke.contextmenu = (n) => {
  n.inputState.lastContextMenu = Date.now();
};
Ie.beforeinput = (n, e) => {
  var t, i;
  if ((e.inputType == "insertText" || e.inputType == "insertCompositionText") && (n.inputState.insertingText = e.data, n.inputState.insertingTextAt = Date.now()), e.inputType == "insertReplacementText" && n.observer.editContext) {
    let s = (t = e.dataTransfer) === null || t === void 0 ? void 0 : t.getData("text/plain"), o = e.getTargetRanges();
    if (s && o.length) {
      let l = o[0], a = n.posAtDOM(l.startContainer, l.startOffset), h = n.posAtDOM(l.endContainer, l.endOffset);
      return Tl(n, { from: a, to: h, insert: n.state.toText(s) }, null), !0;
    }
  }
  let r;
  if (v.chrome && v.android && (r = Hc.find((s) => s.inputType == e.inputType)) && (n.observer.delayAndroidKey(r.key, r.keyCode), r.key == "Backspace" || r.key == "Delete")) {
    let s = ((i = window.visualViewport) === null || i === void 0 ? void 0 : i.height) || 0;
    setTimeout(() => {
      var o;
      (((o = window.visualViewport) === null || o === void 0 ? void 0 : o.height) || 0) > s + 10 && n.hasFocus && (n.contentDOM.blur(), n.focus());
    }, 100);
  }
  return v.ios && e.inputType == "deleteContentForward" && n.observer.flushSoon(), v.safari && e.inputType == "insertText" && n.inputState.composing >= 0 && setTimeout(() => ke.compositionend(n, e), 20), !1;
};
const Ia = /* @__PURE__ */ new Set();
function tg(n) {
  Ia.has(n) || (Ia.add(n), n.addEventListener("copy", () => {
  }), n.addEventListener("cut", () => {
  }));
}
const Ga = ["pre-wrap", "normal", "pre-line", "break-spaces"];
let Ai = !1;
function Na() {
  Ai = !1;
}
class ig {
  constructor(e) {
    this.lineWrapping = e, this.doc = Y.empty, this.heightSamples = {}, this.lineHeight = 14, this.charWidth = 7, this.textHeight = 14, this.lineLength = 30;
  }
  heightForGap(e, t) {
    let i = this.doc.lineAt(t).number - this.doc.lineAt(e).number + 1;
    return this.lineWrapping && (i += Math.max(0, Math.ceil((t - e - i * this.lineLength * 0.5) / this.lineLength))), this.lineHeight * i;
  }
  heightForLine(e) {
    return this.lineWrapping ? (1 + Math.max(0, Math.ceil((e - this.lineLength) / Math.max(1, this.lineLength - 5)))) * this.lineHeight : this.lineHeight;
  }
  setDoc(e) {
    return this.doc = e, this;
  }
  mustRefreshForWrapping(e) {
    return Ga.indexOf(e) > -1 != this.lineWrapping;
  }
  mustRefreshForHeights(e) {
    let t = !1;
    for (let i = 0; i < e.length; i++) {
      let r = e[i];
      r < 0 ? i++ : this.heightSamples[Math.floor(r * 10)] || (t = !0, this.heightSamples[Math.floor(r * 10)] = !0);
    }
    return t;
  }
  refresh(e, t, i, r, s, o) {
    let l = Ga.indexOf(e) > -1, a = Math.abs(t - this.lineHeight) > 0.3 || this.lineWrapping != l;
    if (this.lineWrapping = l, this.lineHeight = t, this.charWidth = i, this.textHeight = r, this.lineLength = s, a) {
      this.heightSamples = {};
      for (let h = 0; h < o.length; h++) {
        let O = o[h];
        O < 0 ? h++ : this.heightSamples[Math.floor(O * 10)] = !0;
      }
    }
    return a;
  }
}
class ng {
  constructor(e, t) {
    this.from = e, this.heights = t, this.index = 0;
  }
  get more() {
    return this.index < this.heights.length;
  }
}
class De {
  /**
  @internal
  */
  constructor(e, t, i, r, s) {
    this.from = e, this.length = t, this.top = i, this.height = r, this._content = s;
  }
  /**
  The type of element this is. When querying lines, this may be
  an array of all the blocks that make up the line.
  */
  get type() {
    return typeof this._content == "number" ? ue.Text : Array.isArray(this._content) ? this._content : this._content.type;
  }
  /**
  The end of the element as a document position.
  */
  get to() {
    return this.from + this.length;
  }
  /**
  The bottom position of the element.
  */
  get bottom() {
    return this.top + this.height;
  }
  /**
  If this is a widget block, this will return the widget
  associated with it.
  */
  get widget() {
    return this._content instanceof ri ? this._content.widget : null;
  }
  /**
  If this is a textblock, this holds the number of line breaks
  that appear in widgets inside the block.
  */
  get widgetLineBreaks() {
    return typeof this._content == "number" ? this._content : 0;
  }
  /**
  @internal
  */
  join(e) {
    let t = (Array.isArray(this._content) ? this._content : [this]).concat(Array.isArray(e._content) ? e._content : [e]);
    return new De(this.from, this.length + e.length, this.top, this.height + e.height, t);
  }
}
var H = /* @__PURE__ */ function(n) {
  return n[n.ByPos = 0] = "ByPos", n[n.ByHeight = 1] = "ByHeight", n[n.ByPosNoHeight = 2] = "ByPosNoHeight", n;
}(H || (H = {}));
const cr = 1e-3;
class ye {
  constructor(e, t, i = 2) {
    this.length = e, this.height = t, this.flags = i;
  }
  get outdated() {
    return (this.flags & 2) > 0;
  }
  set outdated(e) {
    this.flags = (e ? 2 : 0) | this.flags & -3;
  }
  setHeight(e) {
    this.height != e && (Math.abs(this.height - e) > cr && (Ai = !0), this.height = e);
  }
  // Base case is to replace a leaf node, which simply builds a tree
  // from the new nodes and returns that (HeightMapBranch and
  // HeightMapGap override this to actually use from/to)
  replace(e, t, i) {
    return ye.of(i);
  }
  // Again, these are base cases, and are overridden for branch and gap nodes.
  decomposeLeft(e, t) {
    t.push(this);
  }
  decomposeRight(e, t) {
    t.push(this);
  }
  applyChanges(e, t, i, r) {
    let s = this, o = i.doc;
    for (let l = r.length - 1; l >= 0; l--) {
      let { fromA: a, toA: h, fromB: O, toB: c } = r[l], f = s.lineAt(a, H.ByPosNoHeight, i.setDoc(t), 0, 0), u = f.to >= h ? f : s.lineAt(h, H.ByPosNoHeight, i, 0, 0);
      for (c += u.to - h, h = u.to; l > 0 && f.from <= r[l - 1].toA; )
        a = r[l - 1].fromA, O = r[l - 1].fromB, l--, a < f.from && (f = s.lineAt(a, H.ByPosNoHeight, i, 0, 0));
      O += f.from - a, a = f.from;
      let d = Xl.build(i.setDoc(o), e, O, c);
      s = Cr(s, s.replace(a, h, d));
    }
    return s.updateHeight(i, 0);
  }
  static empty() {
    return new Ze(0, 0, 0);
  }
  // nodes uses null values to indicate the position of line breaks.
  // There are never line breaks at the start or end of the array, or
  // two line breaks next to each other, and the array isn't allowed
  // to be empty (same restrictions as return value from the builder).
  static of(e) {
    if (e.length == 1)
      return e[0];
    let t = 0, i = e.length, r = 0, s = 0;
    for (; ; )
      if (t == i)
        if (r > s * 2) {
          let l = e[t - 1];
          l.break ? e.splice(--t, 1, l.left, null, l.right) : e.splice(--t, 1, l.left, l.right), i += 1 + l.break, r -= l.size;
        } else if (s > r * 2) {
          let l = e[i];
          l.break ? e.splice(i, 1, l.left, null, l.right) : e.splice(i, 1, l.left, l.right), i += 2 + l.break, s -= l.size;
        } else
          break;
      else if (r < s) {
        let l = e[t++];
        l && (r += l.size);
      } else {
        let l = e[--i];
        l && (s += l.size);
      }
    let o = !1;
    return e[t - 1] == null ? (o = !0, t--) : e[t] == null && (o = !0, i++), new sg(ye.of(e.slice(0, t)), o, ye.of(e.slice(i)));
  }
}
function Cr(n, e) {
  return n == e ? n : (n.constructor != e.constructor && (Ai = !0), e);
}
ye.prototype.size = 1;
const rg = /* @__PURE__ */ A.replace({});
class of extends ye {
  constructor(e, t, i) {
    super(e, t), this.deco = i, this.spaceAbove = 0;
  }
  mainBlock(e, t) {
    return new De(t, this.length, e + this.spaceAbove, this.height - this.spaceAbove, this.deco || 0);
  }
  blockAt(e, t, i, r) {
    return this.spaceAbove && e < i + this.spaceAbove ? new De(r, 0, i, this.spaceAbove, rg) : this.mainBlock(i, r);
  }
  lineAt(e, t, i, r, s) {
    let o = this.mainBlock(r, s);
    return this.spaceAbove ? this.blockAt(0, i, r, s).join(o) : o;
  }
  forEachLine(e, t, i, r, s, o) {
    e <= s + this.length && t >= s && o(this.lineAt(0, H.ByPos, i, r, s));
  }
  setMeasuredHeight(e) {
    let t = e.heights[e.index++];
    t < 0 ? (this.spaceAbove = -t, t = e.heights[e.index++]) : this.spaceAbove = 0, this.setHeight(t);
  }
  updateHeight(e, t = 0, i = !1, r) {
    return r && r.from <= t && r.more && this.setMeasuredHeight(r), this.outdated = !1, this;
  }
  toString() {
    return `block(${this.length})`;
  }
}
class Ze extends of {
  constructor(e, t, i) {
    super(e, t, null), this.collapsed = 0, this.widgetHeight = 0, this.breaks = 0, this.spaceAbove = i;
  }
  mainBlock(e, t) {
    return new De(t, this.length, e + this.spaceAbove, this.height - this.spaceAbove, this.breaks);
  }
  replace(e, t, i) {
    let r = i[0];
    return i.length == 1 && (r instanceof Ze || r instanceof ce && r.flags & 4) && Math.abs(this.length - r.length) < 10 ? (r instanceof ce ? r = new Ze(r.length, this.height, this.spaceAbove) : r.height = this.height, this.outdated || (r.outdated = !1), r) : ye.of(i);
  }
  updateHeight(e, t = 0, i = !1, r) {
    return r && r.from <= t && r.more ? this.setMeasuredHeight(r) : (i || this.outdated) && (this.spaceAbove = 0, this.setHeight(Math.max(this.widgetHeight, e.heightForLine(this.length - this.collapsed)) + this.breaks * e.lineHeight)), this.outdated = !1, this;
  }
  toString() {
    return `line(${this.length}${this.collapsed ? -this.collapsed : ""}${this.widgetHeight ? ":" + this.widgetHeight : ""})`;
  }
}
class ce extends ye {
  constructor(e) {
    super(e, 0);
  }
  heightMetrics(e, t) {
    let i = e.doc.lineAt(t).number, r = e.doc.lineAt(t + this.length).number, s = r - i + 1, o, l = 0;
    if (e.lineWrapping) {
      let a = Math.min(this.height, e.lineHeight * s);
      o = a / s, this.length > s + 1 && (l = (this.height - a) / (this.length - s - 1));
    } else
      o = this.height / s;
    return { firstLine: i, lastLine: r, perLine: o, perChar: l };
  }
  blockAt(e, t, i, r) {
    let { firstLine: s, lastLine: o, perLine: l, perChar: a } = this.heightMetrics(t, r);
    if (t.lineWrapping) {
      let h = r + (e < t.lineHeight ? 0 : Math.round(Math.max(0, Math.min(1, (e - i) / this.height)) * this.length)), O = t.doc.lineAt(h), c = l + O.length * a, f = Math.max(i, e - c / 2);
      return new De(O.from, O.length, f, c, 0);
    } else {
      let h = Math.max(0, Math.min(o - s, Math.floor((e - i) / l))), { from: O, length: c } = t.doc.line(s + h);
      return new De(O, c, i + l * h, l, 0);
    }
  }
  lineAt(e, t, i, r, s) {
    if (t == H.ByHeight)
      return this.blockAt(e, i, r, s);
    if (t == H.ByPosNoHeight) {
      let { from: u, to: d } = i.doc.lineAt(e);
      return new De(u, d - u, 0, 0, 0);
    }
    let { firstLine: o, perLine: l, perChar: a } = this.heightMetrics(i, s), h = i.doc.lineAt(e), O = l + h.length * a, c = h.number - o, f = r + l * c + a * (h.from - s - c);
    return new De(h.from, h.length, Math.max(r, Math.min(f, r + this.height - O)), O, 0);
  }
  forEachLine(e, t, i, r, s, o) {
    e = Math.max(e, s), t = Math.min(t, s + this.length);
    let { firstLine: l, perLine: a, perChar: h } = this.heightMetrics(i, s);
    for (let O = e, c = r; O <= t; ) {
      let f = i.doc.lineAt(O);
      if (O == e) {
        let d = f.number - l;
        c += a * d + h * (e - s - d);
      }
      let u = a + h * f.length;
      o(new De(f.from, f.length, c, u, 0)), c += u, O = f.to + 1;
    }
  }
  replace(e, t, i) {
    let r = this.length - t;
    if (r > 0) {
      let s = i[i.length - 1];
      s instanceof ce ? i[i.length - 1] = new ce(s.length + r) : i.push(null, new ce(r - 1));
    }
    if (e > 0) {
      let s = i[0];
      s instanceof ce ? i[0] = new ce(e + s.length) : i.unshift(new ce(e - 1), null);
    }
    return ye.of(i);
  }
  decomposeLeft(e, t) {
    t.push(new ce(e - 1), null);
  }
  decomposeRight(e, t) {
    t.push(null, new ce(this.length - e - 1));
  }
  updateHeight(e, t = 0, i = !1, r) {
    let s = t + this.length;
    if (r && r.from <= t + this.length && r.more) {
      let o = [], l = Math.max(t, r.from), a = -1;
      for (r.from > t && o.push(new ce(r.from - t - 1).updateHeight(e, t)); l <= s && r.more; ) {
        let O = e.doc.lineAt(l).length;
        o.length && o.push(null);
        let c = r.heights[r.index++], f = 0;
        c < 0 && (f = -c, c = r.heights[r.index++]), a == -1 ? a = c : Math.abs(c - a) >= cr && (a = -2);
        let u = new Ze(O, c, f);
        u.outdated = !1, o.push(u), l += O + 1;
      }
      l <= s && o.push(null, new ce(s - l).updateHeight(e, l));
      let h = ye.of(o);
      return (a < 0 || Math.abs(h.height - this.height) >= cr || Math.abs(a - this.heightMetrics(e, t).perLine) >= cr) && (Ai = !0), Cr(this, h);
    } else (i || this.outdated) && (this.setHeight(e.heightForGap(t, t + this.length)), this.outdated = !1);
    return this;
  }
  toString() {
    return `gap(${this.length})`;
  }
}
class sg extends ye {
  constructor(e, t, i) {
    super(e.length + (t ? 1 : 0) + i.length, e.height + i.height, (t ? 1 : 0) | (e.outdated || i.outdated ? 2 : 0)), this.left = e, this.right = i, this.size = e.size + i.size;
  }
  // Returns 1 if there is a line break between this.left and
  // this.right, 0 otherwise.
  get break() {
    return this.flags & 1;
  }
  blockAt(e, t, i, r) {
    let s = i + this.left.height;
    return e < s ? this.left.blockAt(e, t, i, r) : this.right.blockAt(e, t, s, r + this.left.length + this.break);
  }
  lineAt(e, t, i, r, s) {
    let o = r + this.left.height, l = s + this.left.length + this.break, a = t == H.ByHeight ? e < o : e < l, h = a ? this.left.lineAt(e, t, i, r, s) : this.right.lineAt(e, t, i, o, l);
    if (this.break || (a ? h.to < l : h.from > l))
      return h;
    let O = t == H.ByPosNoHeight ? H.ByPosNoHeight : H.ByPos;
    return a ? h.join(this.right.lineAt(l, O, i, o, l)) : this.left.lineAt(l, O, i, r, s).join(h);
  }
  forEachLine(e, t, i, r, s, o) {
    let l = r + this.left.height, a = s + this.left.length + this.break;
    if (this.break)
      e < a && this.left.forEachLine(e, t, i, r, s, o), t >= a && this.right.forEachLine(e, t, i, l, a, o);
    else {
      let h = this.lineAt(a, H.ByPos, i, r, s);
      e < h.from && this.left.forEachLine(e, Math.min(t, h.from - 1), i, r, s, o), h.to >= e && h.from <= t && o(h), t > h.to && this.right.forEachLine(Math.max(e, h.to + 1), t, i, l, a, o);
    }
  }
  replace(e, t, i) {
    let r = this.left.length + this.break;
    if (t < r)
      return this.balanced(this.left.replace(e, t, i), this.right);
    if (e > this.left.length)
      return this.balanced(this.left, this.right.replace(e - r, t - r, i));
    let s = [];
    e > 0 && this.decomposeLeft(e, s);
    let o = s.length;
    for (let l of i)
      s.push(l);
    if (e > 0 && Fa(s, o - 1), t < this.length) {
      let l = s.length;
      this.decomposeRight(t, s), Fa(s, l);
    }
    return ye.of(s);
  }
  decomposeLeft(e, t) {
    let i = this.left.length;
    if (e <= i)
      return this.left.decomposeLeft(e, t);
    t.push(this.left), this.break && (i++, e >= i && t.push(null)), e > i && this.right.decomposeLeft(e - i, t);
  }
  decomposeRight(e, t) {
    let i = this.left.length, r = i + this.break;
    if (e >= r)
      return this.right.decomposeRight(e - r, t);
    e < i && this.left.decomposeRight(e, t), this.break && e < r && t.push(null), t.push(this.right);
  }
  balanced(e, t) {
    return e.size > 2 * t.size || t.size > 2 * e.size ? ye.of(this.break ? [e, null, t] : [e, t]) : (this.left = Cr(this.left, e), this.right = Cr(this.right, t), this.setHeight(e.height + t.height), this.outdated = e.outdated || t.outdated, this.size = e.size + t.size, this.length = e.length + this.break + t.length, this);
  }
  updateHeight(e, t = 0, i = !1, r) {
    let { left: s, right: o } = this, l = t + s.length + this.break, a = null;
    return r && r.from <= t + s.length && r.more ? a = s = s.updateHeight(e, t, i, r) : s.updateHeight(e, t, i), r && r.from <= l + o.length && r.more ? a = o = o.updateHeight(e, l, i, r) : o.updateHeight(e, l, i), a ? this.balanced(s, o) : (this.height = this.left.height + this.right.height, this.outdated = !1, this);
  }
  toString() {
    return this.left + (this.break ? " " : "-") + this.right;
  }
}
function Fa(n, e) {
  let t, i;
  n[e] == null && (t = n[e - 1]) instanceof ce && (i = n[e + 1]) instanceof ce && n.splice(e - 1, 3, new ce(t.length + 1 + i.length));
}
const og = 5;
class Xl {
  constructor(e, t) {
    this.pos = e, this.oracle = t, this.nodes = [], this.lineStart = -1, this.lineEnd = -1, this.covering = null, this.writtenTo = e;
  }
  get isCovered() {
    return this.covering && this.nodes[this.nodes.length - 1] == this.covering;
  }
  span(e, t) {
    if (this.lineStart > -1) {
      let i = Math.min(t, this.lineEnd), r = this.nodes[this.nodes.length - 1];
      r instanceof Ze ? r.length += i - this.pos : (i > this.pos || !this.isCovered) && this.nodes.push(new Ze(i - this.pos, -1, 0)), this.writtenTo = i, t > i && (this.nodes.push(null), this.writtenTo++, this.lineStart = -1);
    }
    this.pos = t;
  }
  point(e, t, i) {
    if (e < t || i.heightRelevant) {
      let r = i.widget ? i.widget.estimatedHeight : 0, s = i.widget ? i.widget.lineBreaks : 0;
      r < 0 && (r = this.oracle.lineHeight);
      let o = t - e;
      i.block ? this.addBlock(new of(o, r, i)) : (o || s || r >= og) && this.addLineDeco(r, s, o);
    } else t > e && this.span(e, t);
    this.lineEnd > -1 && this.lineEnd < this.pos && (this.lineEnd = this.oracle.doc.lineAt(this.pos).to);
  }
  enterLine() {
    if (this.lineStart > -1)
      return;
    let { from: e, to: t } = this.oracle.doc.lineAt(this.pos);
    this.lineStart = e, this.lineEnd = t, this.writtenTo < e && ((this.writtenTo < e - 1 || this.nodes[this.nodes.length - 1] == null) && this.nodes.push(this.blankContent(this.writtenTo, e - 1)), this.nodes.push(null)), this.pos > e && this.nodes.push(new Ze(this.pos - e, -1, 0)), this.writtenTo = this.pos;
  }
  blankContent(e, t) {
    let i = new ce(t - e);
    return this.oracle.doc.lineAt(e).to == t && (i.flags |= 4), i;
  }
  ensureLine() {
    this.enterLine();
    let e = this.nodes.length ? this.nodes[this.nodes.length - 1] : null;
    if (e instanceof Ze)
      return e;
    let t = new Ze(0, -1, 0);
    return this.nodes.push(t), t;
  }
  addBlock(e) {
    this.enterLine();
    let t = e.deco;
    t && t.startSide > 0 && !this.isCovered && this.ensureLine(), this.nodes.push(e), this.writtenTo = this.pos = this.pos + e.length, t && t.endSide > 0 && (this.covering = e);
  }
  addLineDeco(e, t, i) {
    let r = this.ensureLine();
    r.length += i, r.collapsed += i, r.widgetHeight = Math.max(r.widgetHeight, e), r.breaks += t, this.writtenTo = this.pos = this.pos + i;
  }
  finish(e) {
    let t = this.nodes.length == 0 ? null : this.nodes[this.nodes.length - 1];
    this.lineStart > -1 && !(t instanceof Ze) && !this.isCovered ? this.nodes.push(new Ze(0, -1, 0)) : (this.writtenTo < this.pos || t == null) && this.nodes.push(this.blankContent(this.writtenTo, this.pos));
    let i = e;
    for (let r of this.nodes)
      r instanceof Ze && r.updateHeight(this.oracle, i), i += r ? r.length : 1;
    return this.nodes;
  }
  // Always called with a region that on both sides either stretches
  // to a line break or the end of the document.
  // The returned array uses null to indicate line breaks, but never
  // starts or ends in a line break, or has multiple line breaks next
  // to each other.
  static build(e, t, i, r) {
    let s = new Xl(i, e);
    return _.spans(t, i, r, s, 0), s.finish(i);
  }
}
function lg(n, e, t) {
  let i = new ag();
  return _.compare(n, e, t, i, 0), i.changes;
}
class ag {
  constructor() {
    this.changes = [];
  }
  compareRange() {
  }
  comparePoint(e, t, i, r) {
    (e < t || i && i.heightRelevant || r && r.heightRelevant) && ki(e, t, this.changes, 5);
  }
}
function hg(n, e) {
  let t = n.getBoundingClientRect(), i = n.ownerDocument, r = i.defaultView || window, s = Math.max(0, t.left), o = Math.min(r.innerWidth, t.right), l = Math.max(0, t.top), a = Math.min(r.innerHeight, t.bottom);
  for (let h = n.parentNode; h && h != i.body; )
    if (h.nodeType == 1) {
      let O = h, c = window.getComputedStyle(O);
      if ((O.scrollHeight > O.clientHeight || O.scrollWidth > O.clientWidth) && c.overflow != "visible") {
        let f = O.getBoundingClientRect();
        s = Math.max(s, f.left), o = Math.min(o, f.right), l = Math.max(l, f.top), a = Math.min(h == n.parentNode ? r.innerHeight : a, f.bottom);
      }
      h = c.position == "absolute" || c.position == "fixed" ? O.offsetParent : O.parentNode;
    } else if (h.nodeType == 11)
      h = h.host;
    else
      break;
  return {
    left: s - t.left,
    right: Math.max(s, o) - t.left,
    top: l - (t.top + e),
    bottom: Math.max(l, a) - (t.top + e)
  };
}
function Og(n) {
  let e = n.getBoundingClientRect(), t = n.ownerDocument.defaultView || window;
  return e.left < t.innerWidth && e.right > 0 && e.top < t.innerHeight && e.bottom > 0;
}
function cg(n, e) {
  let t = n.getBoundingClientRect();
  return {
    left: 0,
    right: t.right - t.left,
    top: e,
    bottom: t.bottom - (t.top + e)
  };
}
class Cs {
  constructor(e, t, i, r) {
    this.from = e, this.to = t, this.size = i, this.displaySize = r;
  }
  static same(e, t) {
    if (e.length != t.length)
      return !1;
    for (let i = 0; i < e.length; i++) {
      let r = e[i], s = t[i];
      if (r.from != s.from || r.to != s.to || r.size != s.size)
        return !1;
    }
    return !0;
  }
  draw(e, t) {
    return A.replace({
      widget: new fg(this.displaySize * (t ? e.scaleY : e.scaleX), t)
    }).range(this.from, this.to);
  }
}
class fg extends Ut {
  constructor(e, t) {
    super(), this.size = e, this.vertical = t;
  }
  eq(e) {
    return e.size == this.size && e.vertical == this.vertical;
  }
  toDOM() {
    let e = document.createElement("div");
    return this.vertical ? e.style.height = this.size + "px" : (e.style.width = this.size + "px", e.style.height = "2px", e.style.display = "inline-block"), e;
  }
  get estimatedHeight() {
    return this.vertical ? this.size : -1;
  }
}
class Ha {
  constructor(e, t) {
    this.view = e, this.state = t, this.pixelViewport = { left: 0, right: window.innerWidth, top: 0, bottom: 0 }, this.inView = !0, this.paddingTop = 0, this.paddingBottom = 0, this.contentDOMWidth = 0, this.contentDOMHeight = 0, this.editorHeight = 0, this.editorWidth = 0, this.scaleX = 1, this.scaleY = 1, this.scrollOffset = 0, this.scrolledToBottom = !1, this.scrollAnchorPos = 0, this.scrollAnchorHeight = -1, this.scaler = Ka, this.scrollTarget = null, this.printing = !1, this.mustMeasureContent = !0, this.defaultTextDirection = K.LTR, this.visibleRanges = [], this.mustEnforceCursorAssoc = !1;
    let i = t.facet(Pl).some((r) => typeof r != "function" && r.class == "cm-lineWrapping");
    this.heightOracle = new ig(i), this.stateDeco = Ja(t), this.heightMap = ye.empty().applyChanges(this.stateDeco, Y.empty, this.heightOracle.setDoc(t.doc), [new _e(0, 0, 0, t.doc.length)]);
    for (let r = 0; r < 2 && (this.viewport = this.getViewport(0, null), !!this.updateForViewport()); r++)
      ;
    this.updateViewportLines(), this.lineGaps = this.ensureLineGaps([]), this.lineGapDeco = A.set(this.lineGaps.map((r) => r.draw(this, !1))), this.scrollParent = e.scrollDOM, this.computeVisibleRanges();
  }
  updateForViewport() {
    let e = [this.viewport], { main: t } = this.state.selection;
    for (let i = 0; i <= 1; i++) {
      let r = i ? t.head : t.anchor;
      if (!e.some(({ from: s, to: o }) => r >= s && r <= o)) {
        let { from: s, to: o } = this.lineBlockAt(r);
        e.push(new Dn(s, o));
      }
    }
    return this.viewports = e.sort((i, r) => i.from - r.from), this.updateScaler();
  }
  updateScaler() {
    let e = this.scaler;
    return this.scaler = this.heightMap.height <= 7e6 ? Ka : new Cl(this.heightOracle, this.heightMap, this.viewports), e.eq(this.scaler) ? 0 : 2;
  }
  updateViewportLines() {
    this.viewportLines = [], this.heightMap.forEachLine(this.viewport.from, this.viewport.to, this.heightOracle.setDoc(this.state.doc), 0, 0, (e) => {
      this.viewportLines.push(Ki(e, this.scaler));
    });
  }
  update(e, t = null) {
    this.state = e.state;
    let i = this.stateDeco;
    this.stateDeco = Ja(this.state);
    let r = e.changedRanges, s = _e.extendWithRanges(r, lg(i, this.stateDeco, e ? e.changes : oe.empty(this.state.doc.length))), o = this.heightMap.height, l = this.scrolledToBottom ? null : this.scrollAnchorAt(this.scrollOffset);
    Na(), this.heightMap = this.heightMap.applyChanges(this.stateDeco, e.startState.doc, this.heightOracle.setDoc(this.state.doc), s), (this.heightMap.height != o || Ai) && (e.flags |= 2), l ? (this.scrollAnchorPos = e.changes.mapPos(l.from, -1), this.scrollAnchorHeight = l.top) : (this.scrollAnchorPos = -1, this.scrollAnchorHeight = o);
    let a = s.length ? this.mapViewport(this.viewport, e.changes) : this.viewport;
    (t && (t.range.head < a.from || t.range.head > a.to) || !this.viewportIsAppropriate(a)) && (a = this.getViewport(0, t));
    let h = a.from != this.viewport.from || a.to != this.viewport.to;
    this.viewport = a, e.flags |= this.updateForViewport(), (h || !e.changes.empty || e.flags & 2) && this.updateViewportLines(), (this.lineGaps.length || this.viewport.to - this.viewport.from > 4e3) && this.updateLineGaps(this.ensureLineGaps(this.mapLineGaps(this.lineGaps, e.changes))), e.flags |= this.computeVisibleRanges(e.changes), t && (this.scrollTarget = t), !this.mustEnforceCursorAssoc && (e.selectionSet || e.focusChanged) && e.view.lineWrapping && e.state.selection.main.empty && e.state.selection.main.assoc && !e.state.facet(Mc) && (this.mustEnforceCursorAssoc = !0);
  }
  measure() {
    let { view: e } = this, t = e.contentDOM, i = window.getComputedStyle(t), r = this.heightOracle, s = i.whiteSpace;
    this.defaultTextDirection = i.direction == "rtl" ? K.RTL : K.LTR;
    let o = this.heightOracle.mustRefreshForWrapping(s) || this.mustMeasureContent === "refresh", l = t.getBoundingClientRect(), a = o || this.mustMeasureContent || this.contentDOMHeight != l.height;
    this.contentDOMHeight = l.height, this.mustMeasureContent = !1;
    let h = 0, O = 0;
    if (l.width && l.height) {
      let { scaleX: k, scaleY: x } = Qc(t, l);
      (k > 5e-3 && Math.abs(this.scaleX - k) > 5e-3 || x > 5e-3 && Math.abs(this.scaleY - x) > 5e-3) && (this.scaleX = k, this.scaleY = x, h |= 16, o = a = !0);
    }
    let c = (parseInt(i.paddingTop) || 0) * this.scaleY, f = (parseInt(i.paddingBottom) || 0) * this.scaleY;
    (this.paddingTop != c || this.paddingBottom != f) && (this.paddingTop = c, this.paddingBottom = f, h |= 18), this.editorWidth != e.scrollDOM.clientWidth && (r.lineWrapping && (a = !0), this.editorWidth = e.scrollDOM.clientWidth, h |= 16);
    let u = Sc(this.view.contentDOM, !1).y;
    u != this.scrollParent && (this.scrollParent = u, this.scrollAnchorHeight = -1, this.scrollOffset = 0);
    let d = this.getScrollOffset();
    this.scrollOffset != d && (this.scrollAnchorHeight = -1, this.scrollOffset = d), this.scrolledToBottom = $c(this.scrollParent || e.win);
    let p = (this.printing ? cg : hg)(t, this.paddingTop), g = p.top - this.pixelViewport.top, Q = p.bottom - this.pixelViewport.bottom;
    this.pixelViewport = p;
    let b = this.pixelViewport.bottom > this.pixelViewport.top && this.pixelViewport.right > this.pixelViewport.left;
    if (b != this.inView && (this.inView = b, b && (a = !0)), !this.inView && !this.scrollTarget && !Og(e.dom))
      return 0;
    let y = l.width;
    if ((this.contentDOMWidth != y || this.editorHeight != e.scrollDOM.clientHeight) && (this.contentDOMWidth = l.width, this.editorHeight = e.scrollDOM.clientHeight, h |= 16), a) {
      let k = e.docView.measureVisibleLineHeights(this.viewport);
      if (r.mustRefreshForHeights(k) && (o = !0), o || r.lineWrapping && Math.abs(y - this.contentDOMWidth) > r.charWidth) {
        let { lineHeight: x, charWidth: P, textHeight: j } = e.docView.measureTextSize();
        o = x > 0 && r.refresh(s, x, P, j, Math.max(5, y / P), k), o && (e.docView.minWidth = 0, h |= 16);
      }
      g > 0 && Q > 0 ? O = Math.max(g, Q) : g < 0 && Q < 0 && (O = Math.min(g, Q)), Na();
      for (let x of this.viewports) {
        let P = x.from == this.viewport.from ? k : e.docView.measureVisibleLineHeights(x);
        this.heightMap = (o ? ye.empty().applyChanges(this.stateDeco, Y.empty, this.heightOracle, [new _e(0, 0, 0, e.state.doc.length)]) : this.heightMap).updateHeight(r, 0, o, new ng(x.from, P));
      }
      Ai && (h |= 2);
    }
    let C = !this.viewportIsAppropriate(this.viewport, O) || this.scrollTarget && (this.scrollTarget.range.head < this.viewport.from || this.scrollTarget.range.head > this.viewport.to);
    return C && (h & 2 && (h |= this.updateScaler()), this.viewport = this.getViewport(O, this.scrollTarget), h |= this.updateForViewport()), (h & 2 || C) && this.updateViewportLines(), (this.lineGaps.length || this.viewport.to - this.viewport.from > 4e3) && this.updateLineGaps(this.ensureLineGaps(o ? [] : this.lineGaps, e)), h |= this.computeVisibleRanges(), this.mustEnforceCursorAssoc && (this.mustEnforceCursorAssoc = !1, e.docView.enforceCursorAssoc()), h;
  }
  get visibleTop() {
    return this.scaler.fromDOM(this.pixelViewport.top);
  }
  get visibleBottom() {
    return this.scaler.fromDOM(this.pixelViewport.bottom);
  }
  getViewport(e, t) {
    let i = 0.5 - Math.max(-0.5, Math.min(0.5, e / 1e3 / 2)), r = this.heightMap, s = this.heightOracle, { visibleTop: o, visibleBottom: l } = this, a = new Dn(r.lineAt(o - i * 1e3, H.ByHeight, s, 0, 0).from, r.lineAt(l + (1 - i) * 1e3, H.ByHeight, s, 0, 0).to);
    if (t) {
      let { head: h } = t.range;
      if (h < a.from || h > a.to) {
        let O = Math.min(this.editorHeight, this.pixelViewport.bottom - this.pixelViewport.top), c = r.lineAt(h, H.ByPos, s, 0, 0), f;
        t.y == "center" ? f = (c.top + c.bottom) / 2 - O / 2 : t.y == "start" || t.y == "nearest" && h < a.from ? f = c.top : f = c.bottom - O, a = new Dn(r.lineAt(f - 1e3 / 2, H.ByHeight, s, 0, 0).from, r.lineAt(f + O + 1e3 / 2, H.ByHeight, s, 0, 0).to);
      }
    }
    return a;
  }
  mapViewport(e, t) {
    let i = t.mapPos(e.from, -1), r = t.mapPos(e.to, 1);
    return new Dn(this.heightMap.lineAt(i, H.ByPos, this.heightOracle, 0, 0).from, this.heightMap.lineAt(r, H.ByPos, this.heightOracle, 0, 0).to);
  }
  // Checks if a given viewport covers the visible part of the
  // document and not too much beyond that.
  viewportIsAppropriate({ from: e, to: t }, i = 0) {
    if (!this.inView)
      return !0;
    let { top: r } = this.heightMap.lineAt(e, H.ByPos, this.heightOracle, 0, 0), { bottom: s } = this.heightMap.lineAt(t, H.ByPos, this.heightOracle, 0, 0), { visibleTop: o, visibleBottom: l } = this;
    return (e == 0 || r <= o - Math.max(10, Math.min(
      -i,
      250
      /* VP.MaxCoverMargin */
    ))) && (t == this.state.doc.length || s >= l + Math.max(10, Math.min(
      i,
      250
      /* VP.MaxCoverMargin */
    ))) && r > o - 2 * 1e3 && s < l + 2 * 1e3;
  }
  mapLineGaps(e, t) {
    if (!e.length || t.empty)
      return e;
    let i = [];
    for (let r of e)
      t.touchesRange(r.from, r.to) || i.push(new Cs(t.mapPos(r.from), t.mapPos(r.to), r.size, r.displaySize));
    return i;
  }
  // Computes positions in the viewport where the start or end of a
  // line should be hidden, trying to reuse existing line gaps when
  // appropriate to avoid unneccesary redraws.
  // Uses crude character-counting for the positioning and sizing,
  // since actual DOM coordinates aren't always available and
  // predictable. Relies on generous margins (see LG.Margin) to hide
  // the artifacts this might produce from the user.
  ensureLineGaps(e, t) {
    let i = this.heightOracle.lineWrapping, r = i ? 1e4 : 2e3, s = r >> 1, o = r << 1;
    if (this.defaultTextDirection != K.LTR && !i)
      return [];
    let l = [], a = (O, c, f, u) => {
      if (c - O < s)
        return;
      let d = this.state.selection.main, p = [d.from];
      d.empty || p.push(d.to);
      for (let Q of p)
        if (Q > O && Q < c) {
          a(O, Q - 10, f, u), a(Q + 10, c, f, u);
          return;
        }
      let g = dg(e, (Q) => Q.from >= f.from && Q.to <= f.to && Math.abs(Q.from - O) < s && Math.abs(Q.to - c) < s && !p.some((b) => Q.from < b && Q.to > b));
      if (!g) {
        if (c < f.to && t && i && t.visibleRanges.some((y) => y.from <= c && y.to >= c)) {
          let y = t.moveToLineBoundary(S.cursor(c), !1, !0).head;
          y > O && (c = y);
        }
        let Q = this.gapSize(f, O, c, u), b = i || Q < 2e6 ? Q : 2e6;
        g = new Cs(O, c, Q, b);
      }
      l.push(g);
    }, h = (O) => {
      if (O.length < o || O.type != ue.Text)
        return;
      let c = ug(O.from, O.to, this.stateDeco);
      if (c.total < o)
        return;
      let f = this.scrollTarget ? this.scrollTarget.range.head : null, u, d;
      if (i) {
        let p = r / this.heightOracle.lineLength * this.heightOracle.lineHeight, g, Q;
        if (f != null) {
          let b = In(c, f), y = ((this.visibleBottom - this.visibleTop) / 2 + p) / O.height;
          g = b - y, Q = b + y;
        } else
          g = (this.visibleTop - O.top - p) / O.height, Q = (this.visibleBottom - O.top + p) / O.height;
        u = Bn(c, g), d = Bn(c, Q);
      } else {
        let p = c.total * this.heightOracle.charWidth, g = r * this.heightOracle.charWidth, Q = 0;
        if (p > 2e6)
          for (let x of e)
            x.from >= O.from && x.from < O.to && x.size != x.displaySize && x.from * this.heightOracle.charWidth + Q < this.pixelViewport.left && (Q = x.size - x.displaySize);
        let b = this.pixelViewport.left + Q, y = this.pixelViewport.right + Q, C, k;
        if (f != null) {
          let x = In(c, f), P = ((y - b) / 2 + g) / p;
          C = x - P, k = x + P;
        } else
          C = (b - g) / p, k = (y + g) / p;
        u = Bn(c, C), d = Bn(c, k);
      }
      u > O.from && a(O.from, u, O, c), d < O.to && a(d, O.to, O, c);
    };
    for (let O of this.viewportLines)
      Array.isArray(O.type) ? O.type.forEach(h) : h(O);
    return l;
  }
  gapSize(e, t, i, r) {
    let s = In(r, i) - In(r, t);
    return this.heightOracle.lineWrapping ? e.height * s : r.total * this.heightOracle.charWidth * s;
  }
  updateLineGaps(e) {
    Cs.same(e, this.lineGaps) || (this.lineGaps = e, this.lineGapDeco = A.set(e.map((t) => t.draw(this, this.heightOracle.lineWrapping))));
  }
  computeVisibleRanges(e) {
    let t = this.stateDeco;
    this.lineGaps.length && (t = t.concat(this.lineGapDeco));
    let i = [];
    _.spans(t, this.viewport.from, this.viewport.to, {
      span(s, o) {
        i.push({ from: s, to: o });
      },
      point() {
      }
    }, 20);
    let r = 0;
    if (i.length != this.visibleRanges.length)
      r = 12;
    else
      for (let s = 0; s < i.length && !(r & 8); s++) {
        let o = this.visibleRanges[s], l = i[s];
        (o.from != l.from || o.to != l.to) && (r |= 4, e && e.mapPos(o.from, -1) == l.from && e.mapPos(o.to, 1) == l.to || (r |= 8));
      }
    return this.visibleRanges = i, r;
  }
  lineBlockAt(e) {
    return e >= this.viewport.from && e <= this.viewport.to && this.viewportLines.find((t) => t.from <= e && t.to >= e) || Ki(this.heightMap.lineAt(e, H.ByPos, this.heightOracle, 0, 0), this.scaler);
  }
  lineBlockAtHeight(e) {
    return e >= this.viewportLines[0].top && e <= this.viewportLines[this.viewportLines.length - 1].bottom && this.viewportLines.find((t) => t.top <= e && t.bottom >= e) || Ki(this.heightMap.lineAt(this.scaler.fromDOM(e), H.ByHeight, this.heightOracle, 0, 0), this.scaler);
  }
  getScrollOffset() {
    return this.scrollParent == this.view.scrollDOM ? this.scrollParent.scrollTop * this.scaleY : (this.scrollParent ? this.scrollParent.getBoundingClientRect().top : 0) - this.view.contentDOM.getBoundingClientRect().top;
  }
  scrollAnchorAt(e) {
    let t = this.lineBlockAtHeight(e + 8);
    return t.from >= this.viewport.from || this.viewportLines[0].top - e > 200 ? t : this.viewportLines[0];
  }
  elementAtHeight(e) {
    return Ki(this.heightMap.blockAt(this.scaler.fromDOM(e), this.heightOracle, 0, 0), this.scaler);
  }
  get docHeight() {
    return this.scaler.toDOM(this.heightMap.height);
  }
  get contentHeight() {
    return this.docHeight + this.paddingTop + this.paddingBottom;
  }
}
class Dn {
  constructor(e, t) {
    this.from = e, this.to = t;
  }
}
function ug(n, e, t) {
  let i = [], r = n, s = 0;
  return _.spans(t, n, e, {
    span() {
    },
    point(o, l) {
      o > r && (i.push({ from: r, to: o }), s += o - r), r = l;
    }
  }, 20), r < e && (i.push({ from: r, to: e }), s += e - r), { total: s, ranges: i };
}
function Bn({ total: n, ranges: e }, t) {
  if (t <= 0)
    return e[0].from;
  if (t >= 1)
    return e[e.length - 1].to;
  let i = Math.floor(n * t);
  for (let r = 0; ; r++) {
    let { from: s, to: o } = e[r], l = o - s;
    if (i <= l)
      return s + i;
    i -= l;
  }
}
function In(n, e) {
  let t = 0;
  for (let { from: i, to: r } of n.ranges) {
    if (e <= r) {
      t += e - i;
      break;
    }
    t += r - i;
  }
  return t / n.total;
}
function dg(n, e) {
  for (let t of n)
    if (e(t))
      return t;
}
const Ka = {
  toDOM(n) {
    return n;
  },
  fromDOM(n) {
    return n;
  },
  scale: 1,
  eq(n) {
    return n == this;
  }
};
function Ja(n) {
  let e = n.facet(ns).filter((i) => typeof i != "function"), t = n.facet(wl).filter((i) => typeof i != "function");
  return t.length && e.push(_.join(t)), e;
}
class Cl {
  constructor(e, t, i) {
    let r = 0, s = 0, o = 0;
    this.viewports = i.map(({ from: l, to: a }) => {
      let h = t.lineAt(l, H.ByPos, e, 0, 0).top, O = t.lineAt(a, H.ByPos, e, 0, 0).bottom;
      return r += O - h, { from: l, to: a, top: h, bottom: O, domTop: 0, domBottom: 0 };
    }), this.scale = (7e6 - r) / (t.height - r);
    for (let l of this.viewports)
      l.domTop = o + (l.top - s) * this.scale, o = l.domBottom = l.domTop + (l.bottom - l.top), s = l.bottom;
  }
  toDOM(e) {
    for (let t = 0, i = 0, r = 0; ; t++) {
      let s = t < this.viewports.length ? this.viewports[t] : null;
      if (!s || e < s.top)
        return r + (e - i) * this.scale;
      if (e <= s.bottom)
        return s.domTop + (e - s.top);
      i = s.bottom, r = s.domBottom;
    }
  }
  fromDOM(e) {
    for (let t = 0, i = 0, r = 0; ; t++) {
      let s = t < this.viewports.length ? this.viewports[t] : null;
      if (!s || e < s.domTop)
        return i + (e - r) / this.scale;
      if (e <= s.domBottom)
        return s.top + (e - s.domTop);
      i = s.bottom, r = s.domBottom;
    }
  }
  eq(e) {
    return e instanceof Cl ? this.scale == e.scale && this.viewports.length == e.viewports.length && this.viewports.every((t, i) => t.from == e.viewports[i].from && t.to == e.viewports[i].to) : !1;
  }
}
function Ki(n, e) {
  if (e.scale == 1)
    return n;
  let t = e.toDOM(n.top), i = e.toDOM(n.bottom);
  return new De(n.from, n.length, t, i - t, Array.isArray(n._content) ? n._content.map((r) => Ki(r, e)) : n._content);
}
const Gn = /* @__PURE__ */ X.define({ combine: (n) => n.join(" ") }), Yo = /* @__PURE__ */ X.define({ combine: (n) => n.indexOf(!0) > -1 }), Vo = /* @__PURE__ */ Wt.newName(), lf = /* @__PURE__ */ Wt.newName(), af = /* @__PURE__ */ Wt.newName(), hf = { "&light": "." + lf, "&dark": "." + af };
function Uo(n, e, t) {
  return new Wt(e, {
    finish(i) {
      return /&/.test(i) ? i.replace(/&\w*/, (r) => {
        if (r == "&")
          return n;
        if (!t || !t[r])
          throw new RangeError(`Unsupported selector: ${r}`);
        return t[r];
      }) : n + " " + i;
    }
  });
}
const pg = /* @__PURE__ */ Uo("." + Vo, {
  "&": {
    position: "relative !important",
    boxSizing: "border-box",
    "&.cm-focused": {
      // Provide a simple default outline to make sure a focused
      // editor is visually distinct. Can't leave the default behavior
      // because that will apply to the content element, which is
      // inside the scrollable container and doesn't include the
      // gutters. We also can't use an 'auto' outline, since those
      // are, for some reason, drawn behind the element content, which
      // will cause things like the active line background to cover
      // the outline (#297).
      outline: "1px dotted #212121"
    },
    display: "flex !important",
    flexDirection: "column"
  },
  ".cm-scroller": {
    display: "flex !important",
    alignItems: "flex-start !important",
    fontFamily: "monospace",
    lineHeight: 1.4,
    height: "100%",
    overflowX: "auto",
    position: "relative",
    zIndex: 0,
    overflowAnchor: "none"
  },
  ".cm-content": {
    margin: 0,
    flexGrow: 2,
    flexShrink: 0,
    display: "block",
    whiteSpace: "pre",
    wordWrap: "normal",
    // Issue #456
    boxSizing: "border-box",
    minHeight: "100%",
    padding: "4px 0",
    outline: "none",
    "&[contenteditable=true]": {
      WebkitUserModify: "read-write-plaintext-only"
    }
  },
  ".cm-lineWrapping": {
    whiteSpace_fallback: "pre-wrap",
    // For IE
    whiteSpace: "break-spaces",
    wordBreak: "break-word",
    // For Safari, which doesn't support overflow-wrap: anywhere
    overflowWrap: "anywhere",
    flexShrink: 1
  },
  "&light .cm-content": { caretColor: "black" },
  "&dark .cm-content": { caretColor: "white" },
  ".cm-line": {
    display: "block",
    padding: "0 2px 0 6px"
  },
  ".cm-layer": {
    userSelect: "none",
    // #1708
    position: "absolute",
    left: 0,
    top: 0,
    contain: "size style",
    "& > *": {
      position: "absolute"
    }
  },
  "&light .cm-selectionBackground": {
    background: "#d9d9d9"
  },
  "&dark .cm-selectionBackground": {
    background: "#222"
  },
  "&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "#d7d4f0"
  },
  "&dark.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "#233"
  },
  ".cm-cursorLayer": {
    pointerEvents: "none"
  },
  "&.cm-focused > .cm-scroller > .cm-cursorLayer": {
    animation: "steps(1) cm-blink 1.2s infinite"
  },
  // Two animations defined so that we can switch between them to
  // restart the animation without forcing another style
  // recomputation.
  "@keyframes cm-blink": { "0%": {}, "50%": { opacity: 0 }, "100%": {} },
  "@keyframes cm-blink2": { "0%": {}, "50%": { opacity: 0 }, "100%": {} },
  ".cm-cursor, .cm-dropCursor": {
    borderLeft: "1.2px solid black",
    marginLeft: "-0.6px",
    pointerEvents: "none"
  },
  ".cm-cursor": {
    display: "none"
  },
  "&dark .cm-cursor": {
    borderLeftColor: "#ddd"
  },
  ".cm-selectionHandle": {
    backgroundColor: "currentColor",
    width: "1.5px"
  },
  ".cm-selectionHandle-start::before, .cm-selectionHandle-end::before": {
    content: '""',
    backgroundColor: "inherit",
    borderRadius: "50%",
    width: "8px",
    height: "8px",
    position: "absolute",
    left: "-3.25px"
  },
  ".cm-selectionHandle-start::before": { top: "-8px" },
  ".cm-selectionHandle-end::before": { bottom: "-8px" },
  ".cm-dropCursor": {
    position: "absolute"
  },
  "&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor": {
    display: "block"
  },
  ".cm-iso": {
    unicodeBidi: "isolate"
  },
  ".cm-announced": {
    position: "fixed",
    top: "-10000px"
  },
  "@media print": {
    ".cm-announced": { display: "none" }
  },
  "&light .cm-activeLine": { backgroundColor: "#cceeff44" },
  "&dark .cm-activeLine": { backgroundColor: "#99eeff33" },
  "&light .cm-specialChar": { color: "red" },
  "&dark .cm-specialChar": { color: "#f78" },
  ".cm-gutters": {
    flexShrink: 0,
    display: "flex",
    height: "100%",
    boxSizing: "border-box",
    zIndex: 200
  },
  ".cm-gutters-before": { insetInlineStart: 0 },
  ".cm-gutters-after": { insetInlineEnd: 0 },
  "&light .cm-gutters": {
    backgroundColor: "#f5f5f5",
    color: "#6c6c6c",
    border: "0px solid #ddd",
    "&.cm-gutters-before": { borderRightWidth: "1px" },
    "&.cm-gutters-after": { borderLeftWidth: "1px" }
  },
  "&dark .cm-gutters": {
    backgroundColor: "#333338",
    color: "#ccc"
  },
  ".cm-gutter": {
    display: "flex !important",
    // Necessary -- prevents margin collapsing
    flexDirection: "column",
    flexShrink: 0,
    boxSizing: "border-box",
    minHeight: "100%",
    overflow: "hidden"
  },
  ".cm-gutterElement": {
    boxSizing: "border-box"
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 3px 0 5px",
    minWidth: "20px",
    textAlign: "right",
    whiteSpace: "nowrap"
  },
  "&light .cm-activeLineGutter": {
    backgroundColor: "#e2f2ff"
  },
  "&dark .cm-activeLineGutter": {
    backgroundColor: "#222227"
  },
  ".cm-panels": {
    boxSizing: "border-box",
    position: "sticky",
    left: 0,
    right: 0,
    zIndex: 300
  },
  "&light .cm-panels": {
    backgroundColor: "#f5f5f5",
    color: "black"
  },
  ".cm-panels-top": { top: "0" },
  ".cm-panels-bottom": { bottom: "0" },
  "&light .cm-panels-top": {
    borderBottom: "1px solid #ddd"
  },
  "&light .cm-panels-bottom": {
    borderTop: "1px solid #ddd"
  },
  "&dark .cm-panels": {
    backgroundColor: "#333338",
    color: "white"
  },
  ".cm-dialog": {
    padding: "2px 19px 4px 6px",
    position: "relative",
    "& label": { fontSize: "80%" }
  },
  ".cm-dialog-close": {
    position: "absolute",
    top: "3px",
    right: "4px",
    backgroundColor: "inherit",
    border: "none",
    font: "inherit",
    fontSize: "14px",
    padding: "0"
  },
  ".cm-tab": {
    display: "inline-block",
    overflow: "hidden",
    verticalAlign: "bottom"
  },
  ".cm-widgetBuffer": {
    verticalAlign: "text-top",
    height: "1em",
    width: 0,
    display: "inline"
  },
  ".cm-placeholder": {
    color: "#888",
    display: "inline-block",
    verticalAlign: "top",
    userSelect: "none"
  },
  ".cm-highlightSpace": {
    background: "radial-gradient(circle at 50% 55%, #aaa 20%, transparent 0) no-repeat",
    backgroundSize: ".4em",
    backgroundPosition: "calc(min(50%, 0px)) center"
  },
  ".cm-highlightTab": {
    backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20"><path stroke="%23888" stroke-width="1" fill="none" d="M1 10H196L190 5M190 15L196 10M197 4L197 16"/></svg>')`,
    backgroundSize: "auto 100%",
    backgroundPosition: "right 90%",
    backgroundRepeat: "no-repeat"
  },
  ".cm-trailingSpace": {
    backgroundColor: "#ff332255"
  },
  ".cm-button": {
    verticalAlign: "middle",
    color: "inherit",
    fontSize: "70%",
    padding: ".2em 1em",
    borderRadius: "1px"
  },
  "&light .cm-button": {
    backgroundImage: "linear-gradient(#eff1f5, #d9d9df)",
    border: "1px solid #888",
    "&:active": {
      backgroundImage: "linear-gradient(#b4b4b4, #d0d3d6)"
    }
  },
  "&dark .cm-button": {
    backgroundImage: "linear-gradient(#393939, #111)",
    border: "1px solid #888",
    "&:active": {
      backgroundImage: "linear-gradient(#111, #333)"
    }
  },
  ".cm-textfield": {
    verticalAlign: "middle",
    color: "inherit",
    fontSize: "70%",
    border: "1px solid silver",
    padding: ".2em .5em"
  },
  "&light .cm-textfield": {
    backgroundColor: "white"
  },
  "&dark .cm-textfield": {
    border: "1px solid #555",
    backgroundColor: "inherit"
  }
}, hf), mg = {
  childList: !0,
  characterData: !0,
  subtree: !0,
  attributes: !0,
  characterDataOldValue: !0
}, Zs = v.ie && v.ie_version <= 11;
class gg {
  constructor(e) {
    this.view = e, this.active = !1, this.editContext = null, this.selectionRange = new Bp(), this.selectionChanged = !1, this.delayedFlush = -1, this.resizeTimeout = -1, this.queue = [], this.delayedAndroidKey = null, this.flushingAndroidKey = -1, this.lastChange = 0, this.scrollTargets = [], this.intersection = null, this.resizeScroll = null, this.intersecting = !1, this.gapIntersection = null, this.gaps = [], this.printQuery = null, this.parentCheck = -1, this.dom = e.contentDOM, this.observer = new MutationObserver((t) => {
      for (let i of t)
        this.queue.push(i);
      (v.ie && v.ie_version <= 11 || v.ios && e.composing) && t.some((i) => i.type == "childList" && i.removedNodes.length || i.type == "characterData" && i.oldValue.length > i.target.nodeValue.length) ? this.flushSoon() : this.flush();
    }), window.EditContext && v.android && e.constructor.EDIT_CONTEXT !== !1 && // Chrome <126 doesn't support inverted selections in edit context (#1392)
    !(v.chrome && v.chrome_version < 126) && (this.editContext = new Sg(e), e.state.facet(St) && (e.contentDOM.editContext = this.editContext.editContext)), Zs && (this.onCharData = (t) => {
      this.queue.push({
        target: t.target,
        type: "characterData",
        oldValue: t.prevValue
      }), this.flushSoon();
    }), this.onSelectionChange = this.onSelectionChange.bind(this), this.onResize = this.onResize.bind(this), this.onPrint = this.onPrint.bind(this), this.onScroll = this.onScroll.bind(this), window.matchMedia && (this.printQuery = window.matchMedia("print")), typeof ResizeObserver == "function" && (this.resizeScroll = new ResizeObserver(() => {
      var t;
      ((t = this.view.docView) === null || t === void 0 ? void 0 : t.lastUpdate) < Date.now() - 75 && this.onResize();
    }), this.resizeScroll.observe(e.scrollDOM)), this.addWindowListeners(this.win = e.win), this.start(), typeof IntersectionObserver == "function" && (this.intersection = new IntersectionObserver((t) => {
      this.parentCheck < 0 && (this.parentCheck = setTimeout(this.listenForScroll.bind(this), 1e3)), t.length > 0 && t[t.length - 1].intersectionRatio > 0 != this.intersecting && (this.intersecting = !this.intersecting, this.intersecting != this.view.inView && this.onScrollChanged(document.createEvent("Event")));
    }, { threshold: [0, 1e-3] }), this.intersection.observe(this.dom), this.gapIntersection = new IntersectionObserver((t) => {
      t.length > 0 && t[t.length - 1].intersectionRatio > 0 && this.onScrollChanged(document.createEvent("Event"));
    }, {})), this.listenForScroll(), this.readSelectionRange();
  }
  onScrollChanged(e) {
    this.view.inputState.runHandlers("scroll", e), this.intersecting && this.view.measure();
  }
  onScroll(e) {
    this.intersecting && this.flush(!1), this.editContext && this.view.requestMeasure(this.editContext.measureReq), this.onScrollChanged(e);
  }
  onResize() {
    this.resizeTimeout < 0 && (this.resizeTimeout = setTimeout(() => {
      this.resizeTimeout = -1, this.view.requestMeasure();
    }, 50));
  }
  onPrint(e) {
    (e.type == "change" || !e.type) && !e.matches || (this.view.viewState.printing = !0, this.view.measure(), setTimeout(() => {
      this.view.viewState.printing = !1, this.view.requestMeasure();
    }, 500));
  }
  updateGaps(e) {
    if (this.gapIntersection && (e.length != this.gaps.length || this.gaps.some((t, i) => t != e[i]))) {
      this.gapIntersection.disconnect();
      for (let t of e)
        this.gapIntersection.observe(t);
      this.gaps = e;
    }
  }
  onSelectionChange(e) {
    let t = this.selectionChanged;
    if (!this.readSelectionRange() || this.delayedAndroidKey)
      return;
    let { view: i } = this, r = this.selectionRange;
    if (i.state.facet(St) ? i.root.activeElement != this.dom : !rn(this.dom, r))
      return;
    let s = r.anchorNode && i.docView.tile.nearest(r.anchorNode);
    if (s && s.isWidget() && s.widget.ignoreEvent(e)) {
      t || (this.selectionChanged = !1);
      return;
    }
    (v.ie && v.ie_version <= 11 || v.android && v.chrome) && !i.state.selection.main.empty && // (Selection.isCollapsed isn't reliable on IE)
    r.focusNode && on(r.focusNode, r.focusOffset, r.anchorNode, r.anchorOffset) ? this.flushSoon() : this.flush(!1);
  }
  readSelectionRange() {
    let { view: e } = this, t = pn(e.root);
    if (!t)
      return !1;
    let i = v.safari && e.root.nodeType == 11 && e.root.activeElement == this.dom && Qg(this.view, t) || t;
    if (!i || this.selectionRange.eq(i))
      return !1;
    let r = rn(this.dom, i);
    return r && !this.selectionChanged && e.inputState.lastFocusTime > Date.now() - 200 && e.inputState.lastTouchTime < Date.now() - 300 && Gp(this.dom, i) ? (this.view.inputState.lastFocusTime = 0, e.docView.updateSelection(), !1) : (this.selectionRange.setRange(i), r && (this.selectionChanged = !0), !0);
  }
  setSelectionRange(e, t) {
    this.selectionRange.set(e.node, e.offset, t.node, t.offset), this.selectionChanged = !1;
  }
  clearSelectionRange() {
    this.selectionRange.set(null, 0, null, 0);
  }
  listenForScroll() {
    this.parentCheck = -1;
    let e = 0, t = null;
    for (let i = this.dom; i; )
      if (i.nodeType == 1)
        !t && e < this.scrollTargets.length && this.scrollTargets[e] == i ? e++ : t || (t = this.scrollTargets.slice(0, e)), t && t.push(i), i = i.assignedSlot || i.parentNode;
      else if (i.nodeType == 11)
        i = i.host;
      else
        break;
    if (e < this.scrollTargets.length && !t && (t = this.scrollTargets.slice(0, e)), t) {
      for (let i of this.scrollTargets)
        i.removeEventListener("scroll", this.onScroll);
      for (let i of this.scrollTargets = t)
        i.addEventListener("scroll", this.onScroll);
    }
  }
  ignore(e) {
    if (!this.active)
      return e();
    try {
      return this.stop(), e();
    } finally {
      this.start(), this.clear();
    }
  }
  start() {
    this.active || (this.observer.observe(this.dom, mg), Zs && this.dom.addEventListener("DOMCharacterDataModified", this.onCharData), this.active = !0);
  }
  stop() {
    this.active && (this.active = !1, this.observer.disconnect(), Zs && this.dom.removeEventListener("DOMCharacterDataModified", this.onCharData));
  }
  // Throw away any pending changes
  clear() {
    this.processRecords(), this.queue.length = 0, this.selectionChanged = !1;
  }
  // Chrome Android, especially in combination with GBoard, not only
  // doesn't reliably fire regular key events, but also often
  // surrounds the effect of enter or backspace with a bunch of
  // composition events that, when interrupted, cause text duplication
  // or other kinds of corruption. This hack makes the editor back off
  // from handling DOM changes for a moment when such a key is
  // detected (via beforeinput or keydown), and then tries to flush
  // them or, if that has no effect, dispatches the given key.
  delayAndroidKey(e, t) {
    var i;
    if (!this.delayedAndroidKey) {
      let r = () => {
        let s = this.delayedAndroidKey;
        s && (this.clearDelayedAndroidKey(), this.view.inputState.lastKeyCode = s.keyCode, this.view.inputState.lastKeyTime = Date.now(), !this.flush() && s.force && $i(this.dom, s.key, s.keyCode));
      };
      this.flushingAndroidKey = this.view.win.requestAnimationFrame(r);
    }
    (!this.delayedAndroidKey || e == "Enter") && (this.delayedAndroidKey = {
      key: e,
      keyCode: t,
      // Only run the key handler when no changes are detected if
      // this isn't coming right after another change, in which case
      // it is probably part of a weird chain of updates, and should
      // be ignored if it returns the DOM to its previous state.
      force: this.lastChange < Date.now() - 50 || !!(!((i = this.delayedAndroidKey) === null || i === void 0) && i.force)
    });
  }
  clearDelayedAndroidKey() {
    this.win.cancelAnimationFrame(this.flushingAndroidKey), this.delayedAndroidKey = null, this.flushingAndroidKey = -1;
  }
  flushSoon() {
    this.delayedFlush < 0 && (this.delayedFlush = this.view.win.requestAnimationFrame(() => {
      this.delayedFlush = -1, this.flush();
    }));
  }
  forceFlush() {
    this.delayedFlush >= 0 && (this.view.win.cancelAnimationFrame(this.delayedFlush), this.delayedFlush = -1), this.flush();
  }
  pendingRecords() {
    for (let e of this.observer.takeRecords())
      this.queue.push(e);
    return this.queue;
  }
  processRecords() {
    let e = this.pendingRecords();
    e.length && (this.queue = []);
    let t = -1, i = -1, r = !1;
    for (let s of e) {
      let o = this.readMutation(s);
      o && (o.typeOver && (r = !0), t == -1 ? { from: t, to: i } = o : (t = Math.min(o.from, t), i = Math.max(o.to, i)));
    }
    return { from: t, to: i, typeOver: r };
  }
  readChange() {
    let { from: e, to: t, typeOver: i } = this.processRecords(), r = this.selectionChanged && rn(this.dom, this.selectionRange);
    if (e < 0 && !r)
      return null;
    e > -1 && (this.lastChange = Date.now()), this.view.inputState.lastFocusTime = 0, this.selectionChanged = !1;
    let s = new jm(this.view, e, t, i);
    return this.view.docView.domChanged = { newSel: s.newSel ? s.newSel.main : null }, s;
  }
  // Apply pending changes, if any
  flush(e = !0) {
    if (this.delayedFlush >= 0 || this.delayedAndroidKey)
      return !1;
    e && this.readSelectionRange();
    let t = this.readChange();
    if (!t)
      return this.view.requestMeasure(), !1;
    let i = this.view.state, r = Nc(this.view, t);
    return this.view.state == i && (t.domChanged || t.newSel && !Xr(this.view.state.selection, t.newSel.main)) && this.view.update([]), r;
  }
  readMutation(e) {
    let t = this.view.docView.tile.nearest(e.target);
    if (!t || t.isWidget())
      return null;
    if (t.markDirty(e.type == "attributes"), e.type == "childList") {
      let i = eh(t, e.previousSibling || e.target.previousSibling, -1), r = eh(t, e.nextSibling || e.target.nextSibling, 1);
      return {
        from: i ? t.posAfter(i) : t.posAtStart,
        to: r ? t.posBefore(r) : t.posAtEnd,
        typeOver: !1
      };
    } else return e.type == "characterData" ? { from: t.posAtStart, to: t.posAtEnd, typeOver: e.target.nodeValue == e.oldValue } : null;
  }
  setWindow(e) {
    e != this.win && (this.removeWindowListeners(this.win), this.win = e, this.addWindowListeners(this.win));
  }
  addWindowListeners(e) {
    e.addEventListener("resize", this.onResize), this.printQuery ? this.printQuery.addEventListener ? this.printQuery.addEventListener("change", this.onPrint) : this.printQuery.addListener(this.onPrint) : e.addEventListener("beforeprint", this.onPrint), e.addEventListener("scroll", this.onScroll), e.document.addEventListener("selectionchange", this.onSelectionChange);
  }
  removeWindowListeners(e) {
    e.removeEventListener("scroll", this.onScroll), e.removeEventListener("resize", this.onResize), this.printQuery ? this.printQuery.removeEventListener ? this.printQuery.removeEventListener("change", this.onPrint) : this.printQuery.removeListener(this.onPrint) : e.removeEventListener("beforeprint", this.onPrint), e.document.removeEventListener("selectionchange", this.onSelectionChange);
  }
  update(e) {
    this.editContext && (this.editContext.update(e), e.startState.facet(St) != e.state.facet(St) && (e.view.contentDOM.editContext = e.state.facet(St) ? this.editContext.editContext : null));
  }
  destroy() {
    var e, t, i;
    this.stop(), (e = this.intersection) === null || e === void 0 || e.disconnect(), (t = this.gapIntersection) === null || t === void 0 || t.disconnect(), (i = this.resizeScroll) === null || i === void 0 || i.disconnect();
    for (let r of this.scrollTargets)
      r.removeEventListener("scroll", this.onScroll);
    this.removeWindowListeners(this.win), clearTimeout(this.parentCheck), clearTimeout(this.resizeTimeout), this.win.cancelAnimationFrame(this.delayedFlush), this.win.cancelAnimationFrame(this.flushingAndroidKey), this.editContext && (this.view.contentDOM.editContext = null, this.editContext.destroy());
  }
}
function eh(n, e, t) {
  for (; e; ) {
    let i = te.get(e);
    if (i && i.parent == n)
      return i;
    let r = e.parentNode;
    e = r != n.dom ? r : t > 0 ? e.nextSibling : e.previousSibling;
  }
  return null;
}
function th(n, e) {
  let t = e.startContainer, i = e.startOffset, r = e.endContainer, s = e.endOffset, o = n.docView.domAtPos(n.state.selection.main.anchor, 1);
  return on(o.node, o.offset, r, s) && ([t, i, r, s] = [r, s, t, i]), { anchorNode: t, anchorOffset: i, focusNode: r, focusOffset: s };
}
function Qg(n, e) {
  if (e.getComposedRanges) {
    let r = e.getComposedRanges(n.root)[0];
    if (r)
      return th(n, r);
  }
  let t = null;
  function i(r) {
    r.preventDefault(), r.stopImmediatePropagation(), t = r.getTargetRanges()[0];
  }
  return n.contentDOM.addEventListener("beforeinput", i, !0), n.dom.ownerDocument.execCommand("indent"), n.contentDOM.removeEventListener("beforeinput", i, !0), t ? th(n, t) : null;
}
class Sg {
  constructor(e) {
    this.from = 0, this.to = 0, this.pendingContextChange = null, this.handlers = /* @__PURE__ */ Object.create(null), this.composing = null, this.resetRange(e.state);
    let t = this.editContext = new window.EditContext({
      text: e.state.doc.sliceString(this.from, this.to),
      selectionStart: this.toContextPos(Math.max(this.from, Math.min(this.to, e.state.selection.main.anchor))),
      selectionEnd: this.toContextPos(e.state.selection.main.head)
    });
    this.handlers.textupdate = (i) => {
      let r = e.state.selection.main, { anchor: s, head: o } = r, l = this.toEditorPos(i.updateRangeStart), a = this.toEditorPos(i.updateRangeEnd);
      e.inputState.composing >= 0 && !this.composing && (this.composing = { contextBase: i.updateRangeStart, editorBase: l, drifted: !1 });
      let h = a - l > i.text.length;
      l == this.from && s < this.from ? l = s : a == this.to && s > this.to && (a = s);
      let O = Fc(e.state.sliceDoc(l, a), i.text, (h ? r.from : r.to) - l, h ? "end" : null);
      if (!O) {
        let f = S.single(this.toEditorPos(i.selectionStart), this.toEditorPos(i.selectionEnd));
        Xr(f, r) || e.dispatch({ selection: f, userEvent: "select" });
        return;
      }
      let c = {
        from: O.from + l,
        to: O.toA + l,
        insert: Y.of(i.text.slice(O.from, O.toB).split(`
`))
      };
      if ((v.mac || v.android) && c.from == o - 1 && /^\. ?$/.test(i.text) && e.contentDOM.getAttribute("autocorrect") == "off" && (c = { from: l, to: a, insert: Y.of([i.text.replace(".", " ")]) }), this.pendingContextChange = c, !e.state.readOnly) {
        let f = this.to - this.from + (c.to - c.from + c.insert.length);
        Tl(e, c, S.single(this.toEditorPos(i.selectionStart, f), this.toEditorPos(i.selectionEnd, f)));
      }
      this.pendingContextChange && (this.revertPending(e.state), this.setSelection(e.state)), c.from < c.to && !c.insert.length && e.inputState.composing >= 0 && !/[\\p{Alphabetic}\\p{Number}_]/.test(t.text.slice(Math.max(0, i.updateRangeStart - 1), Math.min(t.text.length, i.updateRangeStart + 1))) && this.handlers.compositionend(i);
    }, this.handlers.characterboundsupdate = (i) => {
      let r = [], s = null;
      for (let o = this.toEditorPos(i.rangeStart), l = this.toEditorPos(i.rangeEnd); o < l; o++) {
        let a = e.coordsForChar(o);
        s = a && new DOMRect(a.left, a.top, a.right - a.left, a.bottom - a.top) || s || new DOMRect(), r.push(s);
      }
      t.updateCharacterBounds(i.rangeStart, r);
    }, this.handlers.textformatupdate = (i) => {
      let r = [];
      for (let s of i.getTextFormats()) {
        let o = s.underlineStyle, l = s.underlineThickness;
        if (!/none/i.test(o) && !/none/i.test(l)) {
          let a = this.toEditorPos(s.rangeStart), h = this.toEditorPos(s.rangeEnd);
          if (a < h) {
            let O = `text-decoration: underline ${/^[a-z]/.test(o) ? o + " " : o == "Dashed" ? "dashed " : o == "Squiggle" ? "wavy " : ""}${/thin/i.test(l) ? 1 : 2}px`;
            r.push(A.mark({ attributes: { style: O } }).range(a, h));
          }
        }
      }
      e.dispatch({ effects: Ec.of(A.set(r)) });
    }, this.handlers.compositionstart = () => {
      e.inputState.composing < 0 && (e.inputState.composing = 0, e.inputState.compositionFirstChange = !0);
    }, this.handlers.compositionend = () => {
      if (e.inputState.composing = -1, e.inputState.compositionFirstChange = null, this.composing) {
        let { drifted: i } = this.composing;
        this.composing = null, i && this.reset(e.state);
      }
    };
    for (let i in this.handlers)
      t.addEventListener(i, this.handlers[i]);
    this.measureReq = { read: (i) => {
      let r = pn(i.root);
      r && r.rangeCount && this.editContext.updateSelectionBounds(r.getRangeAt(0).getBoundingClientRect());
    } };
  }
  applyEdits(e) {
    let t = 0, i = !1, r = this.pendingContextChange;
    return e.changes.iterChanges((s, o, l, a, h) => {
      if (i)
        return;
      let O = h.length - (o - s);
      if (r && o >= r.to)
        if (r.from == s && r.to == o && r.insert.eq(h)) {
          r = this.pendingContextChange = null, t += O, this.to += O;
          return;
        } else
          r = null, this.revertPending(e.state);
      if (s += t, o += t, o <= this.from)
        this.from += O, this.to += O;
      else if (s < this.to) {
        if (s < this.from || o > this.to || this.to - this.from + h.length > 3e4) {
          i = !0;
          return;
        }
        this.editContext.updateText(this.toContextPos(s), this.toContextPos(o), h.toString()), this.to += O;
      }
      t += O;
    }), r && !i && this.revertPending(e.state), !i;
  }
  update(e) {
    let t = this.pendingContextChange, i = e.startState.selection.main;
    this.composing && (this.composing.drifted || !e.changes.touchesRange(i.from, i.to) && e.transactions.some((r) => !r.isUserEvent("input.type") && r.changes.touchesRange(this.from, this.to))) ? (this.composing.drifted = !0, this.composing.editorBase = e.changes.mapPos(this.composing.editorBase)) : !this.applyEdits(e) || !this.rangeIsValid(e.state) ? (this.pendingContextChange = null, this.reset(e.state)) : (e.docChanged || e.selectionSet || t) && this.setSelection(e.state), (e.geometryChanged || e.docChanged || e.selectionSet) && e.view.requestMeasure(this.measureReq);
  }
  resetRange(e) {
    let { head: t } = e.selection.main;
    this.from = Math.max(
      0,
      t - 1e4
      /* CxVp.Margin */
    ), this.to = Math.min(
      e.doc.length,
      t + 1e4
      /* CxVp.Margin */
    );
  }
  reset(e) {
    this.resetRange(e), this.editContext.updateText(0, this.editContext.text.length, e.doc.sliceString(this.from, this.to)), this.setSelection(e);
  }
  revertPending(e) {
    let t = this.pendingContextChange;
    this.pendingContextChange = null, this.editContext.updateText(this.toContextPos(t.from), this.toContextPos(t.from + t.insert.length), e.doc.sliceString(t.from, t.to));
  }
  setSelection(e) {
    let { main: t } = e.selection, i = this.toContextPos(Math.max(this.from, Math.min(this.to, t.anchor))), r = this.toContextPos(t.head);
    (this.editContext.selectionStart != i || this.editContext.selectionEnd != r) && this.editContext.updateSelection(i, r);
  }
  rangeIsValid(e) {
    let { head: t } = e.selection.main;
    return !(this.from > 0 && t - this.from < 500 || this.to < e.doc.length && this.to - t < 500 || this.to - this.from > 1e4 * 3);
  }
  toEditorPos(e, t = this.to - this.from) {
    e = Math.min(e, t);
    let i = this.composing;
    return i && i.drifted ? i.editorBase + (e - i.contextBase) : e + this.from;
  }
  toContextPos(e) {
    let t = this.composing;
    return t && t.drifted ? t.contextBase + (e - t.editorBase) : e - this.from;
  }
  destroy() {
    for (let e in this.handlers)
      this.editContext.removeEventListener(e, this.handlers[e]);
  }
}
class T {
  /**
  The current editor state.
  */
  get state() {
    return this.viewState.state;
  }
  /**
  To be able to display large documents without consuming too much
  memory or overloading the browser, CodeMirror only draws the
  code that is visible (plus a margin around it) to the DOM. This
  property tells you the extent of the current drawn viewport, in
  document positions.
  */
  get viewport() {
    return this.viewState.viewport;
  }
  /**
  When there are, for example, large collapsed ranges in the
  viewport, its size can be a lot bigger than the actual visible
  content. Thus, if you are doing something like styling the
  content in the viewport, it is preferable to only do so for
  these ranges, which are the subset of the viewport that is
  actually drawn.
  */
  get visibleRanges() {
    return this.viewState.visibleRanges;
  }
  /**
  Returns false when the editor is entirely scrolled out of view
  or otherwise hidden.
  */
  get inView() {
    return this.viewState.inView;
  }
  /**
  Indicates whether the user is currently composing text via
  [IME](https://en.wikipedia.org/wiki/Input_method), and at least
  one change has been made in the current composition.
  */
  get composing() {
    return !!this.inputState && this.inputState.composing > 0;
  }
  /**
  Indicates whether the user is currently in composing state. Note
  that on some platforms, like Android, this will be the case a
  lot, since just putting the cursor on a word starts a
  composition there.
  */
  get compositionStarted() {
    return !!this.inputState && this.inputState.composing >= 0;
  }
  /**
  The document or shadow root that the view lives in.
  */
  get root() {
    return this._root;
  }
  /**
  @internal
  */
  get win() {
    return this.dom.ownerDocument.defaultView || window;
  }
  /**
  Construct a new view. You'll want to either provide a `parent`
  option, or put `view.dom` into your document after creating a
  view, so that the user can see the editor.
  */
  constructor(e = {}) {
    var t;
    this.plugins = [], this.pluginMap = /* @__PURE__ */ new Map(), this.editorAttrs = {}, this.contentAttrs = {}, this.bidiCache = [], this.destroyed = !1, this.updateState = 2, this.measureScheduled = -1, this.measureRequests = [], this.clearAnnouncement = -1, this.contentDOM = document.createElement("div"), this.scrollDOM = document.createElement("div"), this.scrollDOM.tabIndex = -1, this.scrollDOM.className = "cm-scroller", this.scrollDOM.appendChild(this.contentDOM), this.announceDOM = document.createElement("div"), this.announceDOM.className = "cm-announced", this.announceDOM.setAttribute("aria-live", "polite"), this.dom = document.createElement("div"), this.dom.appendChild(this.announceDOM), this.dom.appendChild(this.scrollDOM), e.parent && e.parent.appendChild(this.dom);
    let { dispatch: i } = e;
    this.dispatchTransactions = e.dispatchTransactions || i && ((r) => r.forEach((s) => i(s, this))) || ((r) => this.update(r)), this.dispatch = this.dispatch.bind(this), this._root = e.root || Ip(e.parent) || document, this.viewState = new Ha(this, e.state || D.create(e)), e.scrollTo && e.scrollTo.is(Yn) && (this.viewState.scrollTarget = e.scrollTo.value.clip(this.viewState.state)), this.plugins = this.state.facet(Qi).map((r) => new Ps(r));
    for (let r of this.plugins)
      r.update(this);
    this.observer = new gg(this), this.inputState = new _m(this), this.inputState.ensureHandlers(this.plugins), this.docView = new Ma(this), this.mountStyles(), this.updateAttrs(), this.updateState = 0, this.requestMeasure(), !((t = document.fonts) === null || t === void 0) && t.ready && document.fonts.ready.then(() => {
      this.viewState.mustMeasureContent = "refresh", this.requestMeasure();
    });
  }
  dispatch(...e) {
    let t = e.length == 1 && e[0] instanceof ne ? e : e.length == 1 && Array.isArray(e[0]) ? e[0] : [this.state.update(...e)];
    this.dispatchTransactions(t, this);
  }
  /**
  Update the view for the given array of transactions. This will
  update the visible document and selection to match the state
  produced by the transactions, and notify view plugins of the
  change. You should usually call
  [`dispatch`](https://codemirror.net/6/docs/ref/#view.EditorView.dispatch) instead, which uses this
  as a primitive.
  */
  update(e) {
    if (this.updateState != 0)
      throw new Error("Calls to EditorView.update are not allowed while an update is in progress");
    let t = !1, i = !1, r, s = this.state;
    for (let f of e) {
      if (f.startState != s)
        throw new RangeError("Trying to update state with a transaction that doesn't start from the previous state.");
      s = f.state;
    }
    if (this.destroyed) {
      this.viewState.state = s;
      return;
    }
    let o = this.hasFocus, l = 0, a = null;
    e.some((f) => f.annotation(nf)) ? (this.inputState.notifiedFocused = o, l = 1) : o != this.inputState.notifiedFocused && (this.inputState.notifiedFocused = o, a = rf(s, o), a || (l = 1));
    let h = this.observer.delayedAndroidKey, O = null;
    if (h ? (this.observer.clearDelayedAndroidKey(), O = this.observer.readChange(), (O && !this.state.doc.eq(s.doc) || !this.state.selection.eq(s.selection)) && (O = null)) : this.observer.clear(), s.facet(D.phrases) != this.state.facet(D.phrases))
      return this.setState(s);
    r = wr.create(this, s, e), r.flags |= l;
    let c = this.viewState.scrollTarget;
    try {
      this.updateState = 2;
      for (let f of e) {
        if (c && (c = c.map(f.changes)), f.scrollIntoView) {
          let { main: u } = f.state.selection, { x: d, y: p } = this.state.facet(T.cursorScrollMargin);
          c = new xi(u.empty ? u : S.cursor(u.head, u.head > u.anchor ? -1 : 1), "nearest", "nearest", p, d);
        }
        for (let u of f.effects)
          u.is(Yn) && (c = u.value.clip(this.state));
      }
      this.viewState.update(r, c), this.bidiCache = Zr.update(this.bidiCache, r.changes), r.empty || (this.updatePlugins(r), this.inputState.update(r)), t = this.docView.update(r), this.state.facet(Hi) != this.styleModules && this.mountStyles(), i = this.updateAttrs(), this.showAnnouncements(e), this.docView.updateSelection(t, e.some((f) => f.isUserEvent("select.pointer")));
    } finally {
      this.updateState = 0;
    }
    if (r.startState.facet(Gn) != r.state.facet(Gn) && (this.viewState.mustMeasureContent = !0), (t || i || c || this.viewState.mustEnforceCursorAssoc || this.viewState.mustMeasureContent) && this.requestMeasure(), t && this.docViewUpdate(), !r.empty)
      for (let f of this.state.facet(zo))
        try {
          f(r);
        } catch (u) {
          je(this.state, u, "update listener");
        }
    (a || O) && Promise.resolve().then(() => {
      a && this.state == a.startState && this.dispatch(a), O && !Nc(this, O) && h.force && $i(this.contentDOM, h.key, h.keyCode);
    });
  }
  /**
  Reset the view to the given state. (This will cause the entire
  document to be redrawn and all view plugins to be reinitialized,
  so you should probably only use it when the new state isn't
  derived from the old state. Otherwise, use
  [`dispatch`](https://codemirror.net/6/docs/ref/#view.EditorView.dispatch) instead.)
  */
  setState(e) {
    if (this.updateState != 0)
      throw new Error("Calls to EditorView.setState are not allowed while an update is in progress");
    if (this.destroyed) {
      this.viewState.state = e;
      return;
    }
    this.updateState = 2;
    let t = this.hasFocus;
    try {
      for (let i of this.plugins)
        i.destroy(this);
      this.viewState = new Ha(this, e), this.plugins = e.facet(Qi).map((i) => new Ps(i)), this.pluginMap.clear();
      for (let i of this.plugins)
        i.update(this);
      this.docView.destroy(), this.docView = new Ma(this), this.inputState.ensureHandlers(this.plugins), this.mountStyles(), this.updateAttrs(), this.bidiCache = [];
    } finally {
      this.updateState = 0;
    }
    t && this.focus(), this.requestMeasure();
  }
  updatePlugins(e) {
    let t = e.startState.facet(Qi), i = e.state.facet(Qi);
    if (t != i) {
      let r = [];
      for (let s of i) {
        let o = t.indexOf(s);
        if (o < 0)
          r.push(new Ps(s));
        else {
          let l = this.plugins[o];
          l.mustUpdate = e, r.push(l);
        }
      }
      for (let s of this.plugins)
        s.mustUpdate != e && s.destroy(this);
      this.plugins = r, this.pluginMap.clear();
    } else
      for (let r of this.plugins)
        r.mustUpdate = e;
    for (let r = 0; r < this.plugins.length; r++)
      this.plugins[r].update(this);
    t != i && this.inputState.ensureHandlers(this.plugins);
  }
  docViewUpdate() {
    for (let e of this.plugins) {
      let t = e.value;
      if (t && t.docViewUpdate)
        try {
          t.docViewUpdate(this);
        } catch (i) {
          je(this.state, i, "doc view update listener");
        }
    }
  }
  /**
  @internal
  */
  measure(e = !0) {
    if (this.destroyed)
      return;
    if (this.measureScheduled > -1 && this.win.cancelAnimationFrame(this.measureScheduled), this.observer.delayedAndroidKey) {
      this.measureScheduled = -1, this.requestMeasure();
      return;
    }
    this.measureScheduled = 0, e && this.observer.forceFlush();
    let t = null, i = this.viewState.scrollParent, r = this.viewState.getScrollOffset(), { scrollAnchorPos: s, scrollAnchorHeight: o, scaleY: l } = this.viewState;
    Math.abs(r - this.viewState.scrollOffset) > 1 && (o = -1), this.viewState.scrollAnchorHeight = -1;
    try {
      for (let a = 0; ; a++) {
        if (o < 0) {
          if ($c(i || this.win))
            s = -1, o = this.viewState.heightMap.height / this.viewState.scaleY;
          else {
            let d = this.viewState.scrollAnchorAt(r);
            s = d.from, o = d.top;
          }
          l = this.viewState.scaleY;
        }
        this.updateState = 1;
        let h = this.viewState.measure();
        if (!h && !this.measureRequests.length && this.viewState.scrollTarget == null)
          break;
        if (a > 5) {
          console.warn(this.measureRequests.length ? "Measure loop restarted more than 5 times" : "Viewport failed to stabilize");
          break;
        }
        let O = [];
        h & 4 || ([this.measureRequests, O] = [O, this.measureRequests]);
        let c = O.map((d) => {
          try {
            return d.read(this);
          } catch (p) {
            return je(this.state, p), ih;
          }
        }), f = wr.create(this, this.state, []), u = !1;
        f.flags |= h, t ? t.flags |= h : t = f, this.updateState = 2, f.empty || (this.updatePlugins(f), this.inputState.update(f), this.updateAttrs(), u = this.docView.update(f), u && this.docViewUpdate());
        for (let d = 0; d < O.length; d++)
          if (c[d] != ih)
            try {
              let p = O[d];
              p.write && p.write(c[d], this);
            } catch (p) {
              je(this.state, p);
            }
        if (u && this.docView.updateSelection(!0), !f.viewportChanged && this.measureRequests.length == 0) {
          if (this.viewState.editorHeight)
            if (this.viewState.scrollTarget) {
              this.docView.scrollIntoView(this.viewState.scrollTarget), this.viewState.scrollTarget = null, o = -1;
              continue;
            } else {
              let p = (s < 0 ? this.viewState.heightMap.height : this.viewState.lineBlockAt(s).top) / this.viewState.scaleY - o / l;
              if ((p > 1 || p < -1) && !(v.ios && this.inputState.lastIOSMomentumScroll > Date.now() - 100) && (i == this.scrollDOM || this.hasFocus || Math.max(this.inputState.lastWheelEvent, this.inputState.lastTouchTime) > Date.now() - 100)) {
                r = r + p, i ? s < 0 ? i.scrollTop = i.scrollHeight : i.scrollTop += p : this.win.scrollBy(0, p), o = -1;
                continue;
              }
            }
          break;
        }
      }
    } finally {
      this.updateState = 0, this.measureScheduled = -1;
    }
    if (t && !t.empty)
      for (let a of this.state.facet(zo))
        a(t);
  }
  /**
  Get the CSS classes for the currently active editor themes.
  */
  get themeClasses() {
    return Vo + " " + (this.state.facet(Yo) ? af : lf) + " " + this.state.facet(Gn);
  }
  updateAttrs() {
    let e = nh(this, Lc, {
      class: "cm-editor" + (this.hasFocus ? " cm-focused " : " ") + this.themeClasses
    }), t = {
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      writingsuggestions: "false",
      translate: "no",
      contenteditable: this.state.facet(St) ? "true" : "false",
      class: "cm-content",
      style: `${v.tabSize}: ${this.state.tabSize}`,
      role: "textbox",
      "aria-multiline": "true"
    };
    this.state.readOnly && (t["aria-readonly"] = "true"), nh(this, Pl, t);
    let i = this.observer.ignore(() => {
      let r = Ra(this.contentDOM, this.contentAttrs, t), s = Ra(this.dom, this.editorAttrs, e);
      return r || s;
    });
    return this.editorAttrs = e, this.contentAttrs = t, i;
  }
  showAnnouncements(e) {
    let t = !0;
    for (let i of e)
      for (let r of i.effects)
        if (r.is(T.announce)) {
          t && (this.announceDOM.textContent = "", this.win.clearTimeout(this.clearAnnouncement), this.clearAnnouncement = this.win.setTimeout(() => {
            this.announceDOM.textContent = " ";
          }, 200), t = !1);
          let s = this.announceDOM.appendChild(document.createElement("div"));
          s.textContent = r.value;
        }
  }
  mountStyles() {
    this.styleModules = this.state.facet(Hi);
    let e = this.state.facet(T.cspNonce);
    Wt.mount(this.root, this.styleModules.concat(pg).reverse(), e ? { nonce: e } : void 0);
  }
  readMeasured() {
    if (this.updateState == 2)
      throw new Error("Reading the editor layout isn't allowed during an update");
    this.updateState == 0 && this.measureScheduled > -1 && this.measure(!1);
  }
  /**
  Schedule a layout measurement, optionally providing callbacks to
  do custom DOM measuring followed by a DOM write phase. Using
  this is preferable reading DOM layout directly from, for
  example, an event handler, because it'll make sure measuring and
  drawing done by other components is synchronized, avoiding
  unnecessary DOM layout computations.
  */
  requestMeasure(e) {
    if (this.measureScheduled < 0 && (this.measureScheduled = this.win.requestAnimationFrame(() => this.measure())), e) {
      if (this.measureRequests.indexOf(e) > -1)
        return;
      if (e.key != null) {
        for (let t = 0; t < this.measureRequests.length; t++)
          if (this.measureRequests[t].key === e.key) {
            this.measureRequests[t] = e;
            return;
          }
      }
      this.measureRequests.push(e);
    }
  }
  /**
  Get the value of a specific plugin, if present. Note that
  plugins that crash can be dropped from a view, so even when you
  know you registered a given plugin, it is recommended to check
  the return value of this method.
  */
  plugin(e) {
    let t = this.pluginMap.get(e);
    return (t === void 0 || t && t.plugin != e) && this.pluginMap.set(e, t = this.plugins.find((i) => i.plugin == e) || null), t && t.update(this).value;
  }
  /**
  The top position of the document, in screen coordinates. This
  may be negative when the editor is scrolled down. Points
  directly to the top of the first line, not above the padding.
  */
  get documentTop() {
    return this.contentDOM.getBoundingClientRect().top + this.viewState.paddingTop;
  }
  /**
  Reports the padding above and below the document.
  */
  get documentPadding() {
    return { top: this.viewState.paddingTop, bottom: this.viewState.paddingBottom };
  }
  /**
  If the editor is transformed with CSS, this provides the scale
  along the X axis. Otherwise, it will just be 1. Note that
  transforms other than translation and scaling are not supported.
  */
  get scaleX() {
    return this.viewState.scaleX;
  }
  /**
  Provide the CSS transformed scale along the Y axis.
  */
  get scaleY() {
    return this.viewState.scaleY;
  }
  /**
  Find the text line or block widget at the given vertical
  position (which is interpreted as relative to the [top of the
  document](https://codemirror.net/6/docs/ref/#view.EditorView.documentTop)).
  */
  elementAtHeight(e) {
    return this.readMeasured(), this.viewState.elementAtHeight(e);
  }
  /**
  Find the line block (see
  [`lineBlockAt`](https://codemirror.net/6/docs/ref/#view.EditorView.lineBlockAt)) at the given
  height, again interpreted relative to the [top of the
  document](https://codemirror.net/6/docs/ref/#view.EditorView.documentTop).
  */
  lineBlockAtHeight(e) {
    return this.readMeasured(), this.viewState.lineBlockAtHeight(e);
  }
  /**
  Get the extent and vertical position of all [line
  blocks](https://codemirror.net/6/docs/ref/#view.EditorView.lineBlockAt) in the viewport. Positions
  are relative to the [top of the
  document](https://codemirror.net/6/docs/ref/#view.EditorView.documentTop);
  */
  get viewportLineBlocks() {
    return this.viewState.viewportLines;
  }
  /**
  Find the line block around the given document position. A line
  block is a range delimited on both sides by either a
  non-[hidden](https://codemirror.net/6/docs/ref/#view.Decoration^replace) line break, or the
  start/end of the document. It will usually just hold a line of
  text, but may be broken into multiple textblocks by block
  widgets.
  */
  lineBlockAt(e) {
    return this.viewState.lineBlockAt(e);
  }
  /**
  The editor's total content height.
  */
  get contentHeight() {
    return this.viewState.contentHeight;
  }
  /**
  Move a cursor position by [grapheme
  cluster](https://codemirror.net/6/docs/ref/#state.findClusterBreak). `forward` determines whether
  the motion is away from the line start, or towards it. In
  bidirectional text, the line is traversed in visual order, using
  the editor's [text direction](https://codemirror.net/6/docs/ref/#view.EditorView.textDirection).
  When the start position was the last one on the line, the
  returned position will be across the line break. If there is no
  further line, the original position is returned.
  
  By default, this method moves over a single cluster. The
  optional `by` argument can be used to move across more. It will
  be called with the first cluster as argument, and should return
  a predicate that determines, for each subsequent cluster,
  whether it should also be moved over.
  */
  moveByChar(e, t, i) {
    return Xs(this, e, _a(this, e, t, i));
  }
  /**
  Move a cursor position across the next group of either
  [letters](https://codemirror.net/6/docs/ref/#state.EditorState.charCategorizer) or non-letter
  non-whitespace characters.
  */
  moveByGroup(e, t) {
    return Xs(this, e, _a(this, e, t, (i) => Xm(this, e.head, i)));
  }
  /**
  **\[DEPRECATED]** Get the cursor position visually at the start
  or end of a line.
  */
  visualLineSide(e, t) {
    return t ? S.cursor(e.to, 1) : S.cursor(e.from, -1);
  }
  /**
  Move to the next line boundary in the given direction. If
  `includeWrap` is true, line wrapping is on, and there is a
  further wrap point on the current line, the wrap point will be
  returned. Otherwise this function will return the start or end
  of the line.
  */
  moveToLineBoundary(e, t, i = !0) {
    return Tm(this, e, t, i);
  }
  /**
  Move a cursor position vertically. When `distance` isn't given,
  it defaults to moving to the next line (including wrapped
  lines). Otherwise, `distance` should provide a positive distance
  in pixels.
  
  When `start` has a
  [`goalColumn`](https://codemirror.net/6/docs/ref/#state.SelectionRange.goalColumn), the vertical
  motion will use that as a target horizontal position. Otherwise,
  the cursor's own horizontal position is used. The returned
  cursor will have its goal column set to whichever column was
  used.
  */
  moveVertically(e, t, i) {
    return Xs(this, e, Cm(this, e, t, i));
  }
  /**
  Find the DOM parent node and offset (child offset if `node` is
  an element, character offset when it is a text node) at the
  given document position.
  
  Note that for positions that aren't currently in
  `visibleRanges`, the resulting DOM position isn't necessarily
  meaningful (it may just point before or after a placeholder
  element).
  */
  domAtPos(e, t = 1) {
    return this.docView.domAtPos(e, t);
  }
  /**
  Find the document position at the given DOM node. Can be useful
  for associating positions with DOM events. Will raise an error
  when `node` isn't part of the editor content.
  */
  posAtDOM(e, t = 0) {
    return this.docView.posFromDOM(e, t);
  }
  posAtCoords(e, t = !0) {
    this.readMeasured();
    let i = Eo(this, e, t);
    return i && i.pos;
  }
  posAndSideAtCoords(e, t = !0) {
    return this.readMeasured(), Eo(this, e, t);
  }
  /**
  Get the screen coordinates at the given document position.
  `side` determines whether the coordinates are based on the
  element before (-1) or after (1) the position (if no element is
  available on the given side, the method will transparently use
  another strategy to get reasonable coordinates).
  */
  coordsAtPos(e, t = 1) {
    this.readMeasured();
    let i = this.state.doc.lineAt(e), r = this.bidiSpans(i), s = r[st.find(r, e - i.from, -1, t)];
    return i.length && (e == i.from && t < 0 || e == i.to && t > 0) && s.dir != this.textDirectionAt(i.from) && (e == i.to ? (e = i.from + s.from, t = 1) : (e = i.from + s.to, t = -1)), this.docView.coordsAt(e, t, s.dir == K.RTL);
  }
  /**
  Return the rectangle around a given character. If `pos` does not
  point in front of a character that is in the viewport and
  rendered (i.e. not replaced, not a line break), this will return
  null. For space characters that are a line wrap point, this will
  return the position before the line break.
  */
  coordsForChar(e) {
    return this.readMeasured(), this.docView.coordsForChar(e);
  }
  /**
  The default width of a character in the editor. May not
  accurately reflect the width of all characters (given variable
  width fonts or styling of invididual ranges).
  */
  get defaultCharacterWidth() {
    return this.viewState.heightOracle.charWidth;
  }
  /**
  The default height of a line in the editor. May not be accurate
  for all lines.
  */
  get defaultLineHeight() {
    return this.viewState.heightOracle.lineHeight;
  }
  /**
  The text direction
  ([`direction`](https://developer.mozilla.org/en-US/docs/Web/CSS/direction)
  CSS property) of the editor's content element.
  */
  get textDirection() {
    return this.viewState.defaultTextDirection;
  }
  /**
  Find the text direction of the block at the given position, as
  assigned by CSS. If
  [`perLineTextDirection`](https://codemirror.net/6/docs/ref/#view.EditorView^perLineTextDirection)
  isn't enabled, or the given position is outside of the viewport,
  this will always return the same as
  [`textDirection`](https://codemirror.net/6/docs/ref/#view.EditorView.textDirection). Note that
  this may trigger a DOM layout.
  */
  textDirectionAt(e) {
    return !this.state.facet(zc) || e < this.viewport.from || e > this.viewport.to ? this.textDirection : (this.readMeasured(), this.docView.textDirectionAt(e));
  }
  /**
  Whether this editor [wraps lines](https://codemirror.net/6/docs/ref/#view.EditorView.lineWrapping)
  (as determined by the
  [`white-space`](https://developer.mozilla.org/en-US/docs/Web/CSS/white-space)
  CSS property of its content element).
  */
  get lineWrapping() {
    return this.viewState.heightOracle.lineWrapping;
  }
  /**
  Returns the bidirectional text structure of the given line
  (which should be in the current document) as an array of span
  objects. The order of these spans matches the [text
  direction](https://codemirror.net/6/docs/ref/#view.EditorView.textDirection)—if that is
  left-to-right, the leftmost spans come first, otherwise the
  rightmost spans come first.
  */
  bidiSpans(e) {
    if (e.length > bg)
      return Xc(e.length);
    let t = this.textDirectionAt(e.from), i;
    for (let s of this.bidiCache)
      if (s.from == e.from && s.dir == t && (s.fresh || Tc(s.isolates, i = ja(this, e))))
        return s.order;
    i || (i = ja(this, e));
    let r = tm(e.text, t, i);
    return this.bidiCache.push(new Zr(e.from, e.to, t, i, !0, r)), r;
  }
  /**
  Check whether the editor has focus.
  */
  get hasFocus() {
    var e;
    return (this.dom.ownerDocument.hasFocus() || v.safari && ((e = this.inputState) === null || e === void 0 ? void 0 : e.lastContextMenu) > Date.now() - 3e4) && this.root.activeElement == this.contentDOM;
  }
  /**
  Put focus on the editor.
  */
  focus() {
    this.observer.ignore(() => {
      kc(this.contentDOM), this.docView.updateSelection();
    });
  }
  /**
  Update the [root](https://codemirror.net/6/docs/ref/##view.EditorViewConfig.root) in which the editor lives. This is only
  necessary when moving the editor's existing DOM to a new window or shadow root.
  */
  setRoot(e) {
    this._root != e && (this._root = e, this.observer.setWindow((e.nodeType == 9 ? e : e.ownerDocument).defaultView || window), this.mountStyles());
  }
  /**
  Clean up this editor view, removing its element from the
  document, unregistering event handlers, and notifying
  plugins. The view instance can no longer be used after
  calling this.
  */
  destroy() {
    this.root.activeElement == this.contentDOM && this.contentDOM.blur();
    for (let e of this.plugins)
      e.destroy(this);
    this.plugins = [], this.inputState.destroy(), this.docView.destroy(), this.dom.remove(), this.observer.destroy(), this.win.clearTimeout(this.clearAnnouncement), this.measureScheduled > -1 && this.win.cancelAnimationFrame(this.measureScheduled), this.destroyed = !0;
  }
  /**
  Returns an effect that can be
  [added](https://codemirror.net/6/docs/ref/#state.TransactionSpec.effects) to a transaction to
  cause it to scroll the given position or range into view.
  */
  static scrollIntoView(e, t = {}) {
    var i, r, s, o;
    return Yn.of(new xi(typeof e == "number" ? S.cursor(e) : e, (i = t.y) !== null && i !== void 0 ? i : "nearest", (r = t.x) !== null && r !== void 0 ? r : "nearest", (s = t.yMargin) !== null && s !== void 0 ? s : 5, (o = t.xMargin) !== null && o !== void 0 ? o : 5));
  }
  /**
  Return an effect that resets the editor to its current (at the
  time this method was called) scroll position. Note that this
  only affects the editor's own scrollable element, not parents.
  See also
  [`EditorViewConfig.scrollTo`](https://codemirror.net/6/docs/ref/#view.EditorViewConfig.scrollTo).
  
  The effect should be used with a document identical to the one
  it was created for. Failing to do so is not an error, but may
  not scroll to the expected position. You can
  [map](https://codemirror.net/6/docs/ref/#state.StateEffect.map) the effect to account for changes.
  */
  scrollSnapshot() {
    let { scrollTop: e, scrollLeft: t } = this.scrollDOM, i = this.viewState.scrollAnchorAt(e);
    return Yn.of(new xi(S.cursor(i.from), "start", "start", i.top - e, t, !0));
  }
  /**
  Enable or disable tab-focus mode, which disables key bindings
  for Tab and Shift-Tab, letting the browser's default
  focus-changing behavior go through instead. This is useful to
  prevent trapping keyboard users in your editor.
  
  Without argument, this toggles the mode. With a boolean, it
  enables (true) or disables it (false). Given a number, it
  temporarily enables the mode until that number of milliseconds
  have passed or another non-Tab key is pressed.
  */
  setTabFocusMode(e) {
    e == null ? this.inputState.tabFocusMode = this.inputState.tabFocusMode < 0 ? 0 : -1 : typeof e == "boolean" ? this.inputState.tabFocusMode = e ? 0 : -1 : this.inputState.tabFocusMode != 0 && (this.inputState.tabFocusMode = Date.now() + e);
  }
  /**
  Returns an extension that can be used to add DOM event handlers.
  The value should be an object mapping event names to handler
  functions. For any given event, such functions are ordered by
  extension precedence, and the first handler to return true will
  be assumed to have handled that event, and no other handlers or
  built-in behavior will be activated for it. These are registered
  on the [content element](https://codemirror.net/6/docs/ref/#view.EditorView.contentDOM), except
  for `scroll` handlers, which will be called any time the
  editor's [scroll element](https://codemirror.net/6/docs/ref/#view.EditorView.scrollDOM) or one of
  its parent nodes is scrolled.
  */
  static domEventHandlers(e) {
    return re.define(() => ({}), { eventHandlers: e });
  }
  /**
  Create an extension that registers DOM event observers. Contrary
  to event [handlers](https://codemirror.net/6/docs/ref/#view.EditorView^domEventHandlers),
  observers can't be prevented from running by a higher-precedence
  handler returning true. They also don't prevent other handlers
  and observers from running when they return true, and should not
  call `preventDefault`.
  */
  static domEventObservers(e) {
    return re.define(() => ({}), { eventObservers: e });
  }
  /**
  Create a theme extension. The first argument can be a
  [`style-mod`](https://code.haverbeke.berlin/marijn/style-mod#documentation)
  style spec providing the styles for the theme. These will be
  prefixed with a generated class for the style.
  
  Because the selectors will be prefixed with a scope class, rule
  that directly match the editor's [wrapper
  element](https://codemirror.net/6/docs/ref/#view.EditorView.dom)—to which the scope class will be
  added—need to be explicitly differentiated by adding an `&` to
  the selector for that element—for example
  `&.cm-focused`.
  
  When `dark` is set to true, the theme will be marked as dark,
  which will cause the `&dark` rules from [base
  themes](https://codemirror.net/6/docs/ref/#view.EditorView^baseTheme) to be used (as opposed to
  `&light` when a light theme is active).
  */
  static theme(e, t) {
    let i = Wt.newName(), r = [Gn.of(i), Hi.of(Uo(`.${i}`, e))];
    return t && t.dark && r.push(Yo.of(!0)), r;
  }
  /**
  Create an extension that adds styles to the base theme. Like
  with [`theme`](https://codemirror.net/6/docs/ref/#view.EditorView^theme), use `&` to indicate the
  place of the editor wrapper element when directly targeting
  that. You can also use `&dark` or `&light` instead to only
  target editors with a dark or light theme.
  */
  static baseTheme(e) {
    return xt.lowest(Hi.of(Uo("." + Vo, e, hf)));
  }
  /**
  Retrieve an editor view instance from the view's DOM
  representation.
  */
  static findFromDOM(e) {
    var t;
    let i = e.querySelector(".cm-content"), r = i && te.get(i) || te.get(e);
    return ((t = r?.root) === null || t === void 0 ? void 0 : t.view) || null;
  }
}
T.styleModule = Hi;
T.inputHandler = jc;
T.clipboardInputFilter = $l;
T.clipboardOutputFilter = xl;
T.scrollHandler = _c;
T.focusChangeEffect = Wc;
T.perLineTextDirection = zc;
T.exceptionSink = qc;
T.updateListener = zo;
T.editable = St;
T.mouseSelectionStyle = Ac;
T.dragMovesSelection = Rc;
T.clickAddsSelectionRange = Zc;
T.decorations = ns;
T.blockWrappers = Yc;
T.outerDecorations = wl;
T.atomicRanges = Rn;
T.bidiIsolatedRanges = Vc;
T.cursorScrollMargin = /* @__PURE__ */ X.define({
  combine: (n) => {
    let e = 5, t = 5;
    for (let i of n)
      typeof i == "number" ? e = t = i : { x: e, y: t } = i;
    return { x: e, y: t };
  }
});
T.scrollMargins = Uc;
T.darkTheme = Yo;
T.cspNonce = /* @__PURE__ */ X.define({ combine: (n) => n.length ? n[0] : "" });
T.contentAttributes = Pl;
T.editorAttributes = Lc;
T.lineWrapping = /* @__PURE__ */ T.contentAttributes.of({ class: "cm-lineWrapping" });
T.announce = /* @__PURE__ */ W.define();
const bg = 4096, ih = {};
class Zr {
  constructor(e, t, i, r, s, o) {
    this.from = e, this.to = t, this.dir = i, this.isolates = r, this.fresh = s, this.order = o;
  }
  static update(e, t) {
    if (t.empty && !e.some((s) => s.fresh))
      return e;
    let i = [], r = e.length ? e[e.length - 1].dir : K.LTR;
    for (let s = Math.max(0, e.length - 10); s < e.length; s++) {
      let o = e[s];
      o.dir == r && !t.touchesRange(o.from, o.to) && i.push(new Zr(t.mapPos(o.from, 1), t.mapPos(o.to, -1), o.dir, o.isolates, !1, o.order));
    }
    return i;
  }
}
function nh(n, e, t) {
  for (let i = n.state.facet(e), r = i.length - 1; r >= 0; r--) {
    let s = i[r], o = typeof s == "function" ? s(n) : s;
    o && bl(o, t);
  }
  return t;
}
const yg = v.mac ? "mac" : v.windows ? "win" : v.linux ? "linux" : "key";
function kg(n, e) {
  const t = n.split(/-(?!$)/);
  let i = t[t.length - 1];
  i == "Space" && (i = " ");
  let r, s, o, l;
  for (let a = 0; a < t.length - 1; ++a) {
    const h = t[a];
    if (/^(cmd|meta|m)$/i.test(h))
      l = !0;
    else if (/^a(lt)?$/i.test(h))
      r = !0;
    else if (/^(c|ctrl|control)$/i.test(h))
      s = !0;
    else if (/^s(hift)?$/i.test(h))
      o = !0;
    else if (/^mod$/i.test(h))
      e == "mac" ? l = !0 : s = !0;
    else
      throw new Error("Unrecognized modifier name: " + h);
  }
  return r && (i = "Alt-" + i), s && (i = "Ctrl-" + i), l && (i = "Meta-" + i), o && (i = "Shift-" + i), i;
}
function Nn(n, e, t) {
  return e.altKey && (n = "Alt-" + n), e.ctrlKey && (n = "Ctrl-" + n), e.metaKey && (n = "Meta-" + n), t !== !1 && e.shiftKey && (n = "Shift-" + n), n;
}
const $g = /* @__PURE__ */ xt.default(/* @__PURE__ */ T.domEventHandlers({
  keydown(n, e) {
    return cf(Of(e.state), n, e, "editor");
  }
})), ls = /* @__PURE__ */ X.define({ enables: $g }), rh = /* @__PURE__ */ new WeakMap();
function Of(n) {
  let e = n.facet(ls), t = rh.get(e);
  return t || rh.set(e, t = wg(e.reduce((i, r) => i.concat(r), []))), t;
}
function xg(n, e, t) {
  return cf(Of(n.state), e, n, t);
}
let Ct = null;
const Pg = 4e3;
function wg(n, e = yg) {
  let t = /* @__PURE__ */ Object.create(null), i = /* @__PURE__ */ Object.create(null), r = (o, l) => {
    let a = i[o];
    if (a == null)
      i[o] = l;
    else if (a != l)
      throw new Error("Key binding " + o + " is used both as a regular binding and as a multi-stroke prefix");
  }, s = (o, l, a, h, O) => {
    var c, f;
    let u = t[o] || (t[o] = /* @__PURE__ */ Object.create(null)), d = l.split(/ (?!$)/).map((Q) => kg(Q, e));
    for (let Q = 1; Q < d.length; Q++) {
      let b = d.slice(0, Q).join(" ");
      r(b, !0), u[b] || (u[b] = {
        preventDefault: !0,
        stopPropagation: !1,
        run: [(y) => {
          let C = Ct = { view: y, prefix: b, scope: o };
          return setTimeout(() => {
            Ct == C && (Ct = null);
          }, Pg), !0;
        }]
      });
    }
    let p = d.join(" ");
    r(p, !1);
    let g = u[p] || (u[p] = {
      preventDefault: !1,
      stopPropagation: !1,
      run: ((f = (c = u._any) === null || c === void 0 ? void 0 : c.run) === null || f === void 0 ? void 0 : f.slice()) || []
    });
    a && g.run.push(a), h && (g.preventDefault = !0), O && (g.stopPropagation = !0);
  };
  for (let o of n) {
    let l = o.scope ? o.scope.split(" ") : ["editor"];
    if (o.any)
      for (let h of l) {
        let O = t[h] || (t[h] = /* @__PURE__ */ Object.create(null));
        O._any || (O._any = { preventDefault: !1, stopPropagation: !1, run: [] });
        let { any: c } = o;
        for (let f in O)
          O[f].run.push((u) => c(u, Do));
      }
    let a = o[e] || o.key;
    if (a)
      for (let h of l)
        s(h, a, o.run, o.preventDefault, o.stopPropagation), o.shift && s(h, "Shift-" + a, o.shift, o.preventDefault, o.stopPropagation);
  }
  return t;
}
let Do = null;
function cf(n, e, t, i) {
  Do = e;
  let r = Ep(e), s = Ae(r, 0), o = nt(s) == r.length && r != " ", l = "", a = !1, h = !1, O = !1;
  Ct && Ct.view == t && Ct.scope == i && (l = Ct.prefix + " ", Kc.indexOf(e.keyCode) < 0 && (h = !0, Ct = null));
  let c = /* @__PURE__ */ new Set(), f = (g) => {
    if (g) {
      for (let Q of g.run)
        if (!c.has(Q) && (c.add(Q), Q(t)))
          return g.stopPropagation && (O = !0), !0;
      g.preventDefault && (g.stopPropagation && (O = !0), h = !0);
    }
    return !1;
  }, u = n[i], d, p;
  return u && (f(u[l + Nn(r, e, !o)]) ? a = !0 : o && (e.altKey || e.metaKey || e.ctrlKey) && // Ctrl-Alt may be used for AltGr on Windows
  !(v.windows && e.ctrlKey && e.altKey) && // Alt-combinations on macOS tend to be typed characters
  !(v.mac && e.altKey && !(e.ctrlKey || e.metaKey)) && (d = zt[e.keyCode]) && d != r ? (f(u[l + Nn(d, e, !0)]) || e.shiftKey && (p = un[e.keyCode]) != r && p != d && f(u[l + Nn(p, e, !1)])) && (a = !0) : o && e.shiftKey && f(u[l + Nn(r, e, !0)]) && (a = !0), !a && f(u._any) && (a = !0)), h && (a = !0), a && O && e.stopPropagation(), Do = null, a;
}
class ii {
  /**
  Create a marker with the given class and dimensions. If `width`
  is null, the DOM element will get no width style.
  */
  constructor(e, t, i, r, s) {
    this.className = e, this.left = t, this.top = i, this.width = r, this.height = s;
  }
  draw() {
    let e = document.createElement("div");
    return e.className = this.className, this.adjust(e), e;
  }
  update(e, t) {
    return t.className != this.className ? !1 : (this.adjust(e), !0);
  }
  adjust(e) {
    e.style.left = this.left + "px", e.style.top = this.top + "px", this.width != null && (e.style.width = this.width + "px"), e.style.height = this.height + "px";
  }
  eq(e) {
    return this.left == e.left && this.top == e.top && this.width == e.width && this.height == e.height && this.className == e.className;
  }
  /**
  Create a set of rectangles for the given selection range,
  assigning them theclass`className`. Will create a single
  rectangle for empty ranges, and a set of selection-style
  rectangles covering the range's content (in a bidi-aware
  way) for non-empty ones.
  */
  static forRange(e, t, i) {
    if (i.empty) {
      let r = e.coordsAtPos(i.head, i.assoc || 1);
      if (!r)
        return [];
      let s = ff(e);
      return [new ii(t, r.left - s.left, r.top - s.top, null, r.bottom - r.top)];
    } else
      return vg(e, t, i);
  }
}
function ff(n) {
  let e = n.scrollDOM.getBoundingClientRect();
  return { left: (n.textDirection == K.LTR ? e.left : e.right - n.scrollDOM.clientWidth * n.scaleX) - n.scrollDOM.scrollLeft * n.scaleX, top: e.top - n.scrollDOM.scrollTop * n.scaleY };
}
function sh(n, e, t, i) {
  let r = n.coordsAtPos(e, t * 2);
  if (!r)
    return i;
  let s = n.dom.getBoundingClientRect(), o = (r.top + r.bottom) / 2, l = n.posAtCoords({ x: s.left + 1, y: o }), a = n.posAtCoords({ x: s.right - 1, y: o });
  return l == null || a == null ? i : { from: Math.max(i.from, Math.min(l, a)), to: Math.min(i.to, Math.max(l, a)) };
}
function vg(n, e, t) {
  if (t.to <= n.viewport.from || t.from >= n.viewport.to)
    return [];
  let i = Math.max(t.from, n.viewport.from), r = Math.min(t.to, n.viewport.to), s = n.textDirection == K.LTR, o = n.contentDOM, l = o.getBoundingClientRect(), a = ff(n), h = o.querySelector(".cm-line"), O = h && window.getComputedStyle(h), c = l.left + (O ? parseInt(O.paddingLeft) + Math.min(0, parseInt(O.textIndent)) : 0), f = l.right - (O ? parseInt(O.paddingRight) : 0), u = _o(n, i, 1), d = _o(n, r, -1), p = u.type == ue.Text ? u : null, g = d.type == ue.Text ? d : null;
  if (p && (n.lineWrapping || u.widgetLineBreaks) && (p = sh(n, i, 1, p)), g && (n.lineWrapping || d.widgetLineBreaks) && (g = sh(n, r, -1, g)), p && g && p.from == g.from && p.to == g.to)
    return b(y(t.from, t.to, p));
  {
    let k = p ? y(t.from, null, p) : C(u, !1), x = g ? y(null, t.to, g) : C(d, !0), P = [];
    return (p || u).to < (g || d).from - (p && g ? 1 : 0) || u.widgetLineBreaks > 1 && k.bottom + n.defaultLineHeight / 2 < x.top ? P.push(Q(c, k.bottom, f, x.top)) : k.bottom < x.top && n.elementAtHeight((k.bottom + x.top) / 2).type == ue.Text && (k.bottom = x.top = (k.bottom + x.top) / 2), b(k).concat(P).concat(b(x));
  }
  function Q(k, x, P, j) {
    return new ii(e, k - a.left, x - a.top, Math.max(0, P - k), j - x);
  }
  function b({ top: k, bottom: x, horizontal: P }) {
    let j = [];
    for (let E = 0; E < P.length; E += 2)
      j.push(Q(P[E], k, P[E + 1], x));
    return j;
  }
  function y(k, x, P) {
    let j = 1e9, E = -1e9, G = [];
    function M(U, F, Se, ve, Fe) {
      let Oe = n.coordsAtPos(U, U == P.to ? -2 : 2), ze = n.coordsAtPos(Se, Se == P.from ? 2 : -2);
      !Oe || !ze || (j = Math.min(Oe.top, ze.top, j), E = Math.max(Oe.bottom, ze.bottom, E), Fe == K.LTR ? G.push(s && F ? c : Oe.left, s && ve ? f : ze.right) : G.push(!s && ve ? c : ze.left, !s && F ? f : Oe.right));
    }
    let R = k ?? P.from, B = x ?? P.to;
    for (let U of n.visibleRanges)
      if (U.to > R && U.from < B)
        for (let F = Math.max(U.from, R), Se = Math.min(U.to, B); ; ) {
          let ve = n.state.doc.lineAt(F);
          for (let Fe of n.bidiSpans(ve)) {
            let Oe = Fe.from + ve.from, ze = Fe.to + ve.from;
            if (Oe >= Se)
              break;
            ze > F && M(Math.max(Oe, F), k == null && Oe <= R, Math.min(ze, Se), x == null && ze >= B, Fe.dir);
          }
          if (F = ve.to + 1, F >= Se)
            break;
        }
    return G.length == 0 && M(R, k == null, B, x == null, n.textDirection), { top: j, bottom: E, horizontal: G };
  }
  function C(k, x) {
    let P = l.top + (x ? k.top : k.bottom);
    return { top: P, bottom: P, horizontal: [] };
  }
}
function Tg(n, e) {
  return n.constructor == e.constructor && n.eq(e);
}
class Xg {
  constructor(e, t) {
    this.view = e, this.layer = t, this.drawn = [], this.scaleX = 1, this.scaleY = 1, this.measureReq = { read: this.measure.bind(this), write: this.draw.bind(this) }, this.dom = e.scrollDOM.appendChild(document.createElement("div")), this.dom.classList.add("cm-layer"), t.above && this.dom.classList.add("cm-layer-above"), t.class && this.dom.classList.add(t.class), this.scale(), this.dom.setAttribute("aria-hidden", "true"), this.setOrder(e.state), e.requestMeasure(this.measureReq), t.mount && t.mount(this.dom, e);
  }
  update(e) {
    e.startState.facet(fr) != e.state.facet(fr) && this.setOrder(e.state), (this.layer.update(e, this.dom) || e.geometryChanged) && (this.scale(), e.view.requestMeasure(this.measureReq));
  }
  docViewUpdate(e) {
    this.layer.updateOnDocViewUpdate !== !1 && e.requestMeasure(this.measureReq);
  }
  setOrder(e) {
    let t = 0, i = e.facet(fr);
    for (; t < i.length && i[t] != this.layer; )
      t++;
    this.dom.style.zIndex = String((this.layer.above ? 150 : -1) - t);
  }
  measure() {
    return this.layer.markers(this.view);
  }
  scale() {
    let { scaleX: e, scaleY: t } = this.view;
    (e != this.scaleX || t != this.scaleY) && (this.scaleX = e, this.scaleY = t, this.dom.style.transform = `scale(${1 / e}, ${1 / t})`);
  }
  draw(e) {
    if (e.length != this.drawn.length || e.some((t, i) => !Tg(t, this.drawn[i]))) {
      let t = this.dom.firstChild, i = 0;
      for (let r of e)
        r.update && t && r.constructor && this.drawn[i].constructor && r.update(t, this.drawn[i]) ? (t = t.nextSibling, i++) : this.dom.insertBefore(r.draw(), t);
      for (; t; ) {
        let r = t.nextSibling;
        t.remove(), t = r;
      }
      this.drawn = e, v.webkit && (this.dom.style.display = this.dom.firstChild ? "" : "none");
    }
  }
  destroy() {
    this.layer.destroy && this.layer.destroy(this.dom, this.view), this.dom.remove();
  }
}
const fr = /* @__PURE__ */ X.define();
function uf(n) {
  return [
    re.define((e) => new Xg(e, n)),
    fr.of(n)
  ];
}
const qi = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, {
      cursorBlinkRate: 1200,
      drawRangeCursor: !0,
      iosSelectionHandles: !0
    }, {
      cursorBlinkRate: (e, t) => Math.min(e, t),
      drawRangeCursor: (e, t) => e || t
    });
  }
});
function Sx(n = {}) {
  return [
    qi.of(n),
    Cg,
    Zg,
    Ag,
    Mc.of(!0)
  ];
}
function df(n) {
  return n.startState.facet(qi) != n.state.facet(qi);
}
const Cg = /* @__PURE__ */ uf({
  above: !0,
  markers(n) {
    let { state: e } = n, t = e.facet(qi), i = [];
    for (let r of e.selection.ranges) {
      let s = r == e.selection.main;
      if (r.empty || t.drawRangeCursor && !(s && v.ios && t.iosSelectionHandles)) {
        let o = s ? "cm-cursor cm-cursor-primary" : "cm-cursor cm-cursor-secondary", l = r.empty ? r : S.cursor(r.head, r.assoc);
        for (let a of ii.forRange(n, o, l))
          i.push(a);
      }
    }
    return i;
  },
  update(n, e) {
    n.transactions.some((i) => i.selection) && (e.style.animationName = e.style.animationName == "cm-blink" ? "cm-blink2" : "cm-blink");
    let t = df(n);
    return t && oh(n.state, e), n.docChanged || n.selectionSet || t;
  },
  mount(n, e) {
    oh(e.state, n);
  },
  class: "cm-cursorLayer"
});
function oh(n, e) {
  e.style.animationDuration = n.facet(qi).cursorBlinkRate + "ms";
}
const Zg = /* @__PURE__ */ uf({
  above: !1,
  markers(n) {
    let e = [], { main: t, ranges: i } = n.state.selection;
    for (let r of i)
      if (!r.empty)
        for (let s of ii.forRange(n, "cm-selectionBackground", r))
          e.push(s);
    if (v.ios && !t.empty && n.state.facet(qi).iosSelectionHandles) {
      for (let r of ii.forRange(n, "cm-selectionHandle cm-selectionHandle-start", S.cursor(t.from, 1)))
        e.push(r);
      for (let r of ii.forRange(n, "cm-selectionHandle cm-selectionHandle-end", S.cursor(t.to, 1)))
        e.push(r);
    }
    return e;
  },
  update(n, e) {
    return n.docChanged || n.selectionSet || n.viewportChanged || df(n);
  },
  class: "cm-selectionLayer"
}), Rg = v.gecko && v.gecko_version == 153 ? "#ffffff01" : "transparent", Ag = /* @__PURE__ */ xt.highest(/* @__PURE__ */ T.theme({
  ".cm-line": {
    "& ::selection, &::selection": { backgroundColor: `${Rg} !important` },
    caretColor: "transparent !important"
  },
  ".cm-content": {
    caretColor: "transparent !important",
    "& :focus": {
      caretColor: "initial !important",
      "&::selection, & ::selection": {
        backgroundColor: "Highlight !important"
      }
    }
  }
})), pf = /* @__PURE__ */ W.define({
  map(n, e) {
    return n == null ? null : e.mapPos(n);
  }
}), Ji = /* @__PURE__ */ $e.define({
  create() {
    return null;
  },
  update(n, e) {
    return n != null && (n = e.changes.mapPos(n)), e.effects.reduce((t, i) => i.is(pf) ? i.value : t, n);
  }
}), qg = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.view = n, this.cursor = null, this.measureReq = { read: this.readPos.bind(this), write: this.drawCursor.bind(this) };
  }
  update(n) {
    var e;
    let t = n.state.field(Ji);
    t == null ? this.cursor != null && ((e = this.cursor) === null || e === void 0 || e.remove(), this.cursor = null) : (this.cursor || (this.cursor = this.view.scrollDOM.appendChild(document.createElement("div")), this.cursor.className = "cm-dropCursor"), (n.startState.field(Ji) != t || n.docChanged || n.geometryChanged) && this.view.requestMeasure(this.measureReq));
  }
  readPos() {
    let { view: n } = this, e = n.state.field(Ji), t = e != null && n.coordsAtPos(e);
    if (!t)
      return null;
    let i = n.scrollDOM.getBoundingClientRect();
    return {
      left: t.left - i.left + n.scrollDOM.scrollLeft * n.scaleX,
      top: t.top - i.top + n.scrollDOM.scrollTop * n.scaleY,
      height: t.bottom - t.top
    };
  }
  drawCursor(n) {
    if (this.cursor) {
      let { scaleX: e, scaleY: t } = this.view;
      n ? (this.cursor.style.left = n.left / e + "px", this.cursor.style.top = n.top / t + "px", this.cursor.style.height = n.height / t + "px") : this.cursor.style.left = "-100000px";
    }
  }
  destroy() {
    this.cursor && this.cursor.remove();
  }
  setDropPos(n) {
    this.view.state.field(Ji) != n && this.view.dispatch({ effects: pf.of(n) });
  }
}, {
  eventObservers: {
    dragover(n) {
      this.setDropPos(this.view.posAtCoords({ x: n.clientX, y: n.clientY }));
    },
    dragleave(n) {
      (n.target == this.view.contentDOM || !this.view.contentDOM.contains(n.relatedTarget)) && this.setDropPos(null);
    },
    dragend() {
      this.setDropPos(null);
    },
    drop() {
      this.setDropPos(null);
    }
  }
});
function bx() {
  return [Ji, qg];
}
function yx() {
  return Wg;
}
const jg = /* @__PURE__ */ A.line({ class: "cm-activeLine" }), Wg = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.decorations = this.getDeco(n);
  }
  update(n) {
    (n.docChanged || n.selectionSet) && (this.decorations = this.getDeco(n.view));
  }
  getDeco(n) {
    let e = -1, t = [];
    for (let i of n.state.selection.ranges) {
      let r = n.lineBlockAt(i.head);
      r.from > e && (t.push(jg.range(r.from)), e = r.from);
    }
    return A.set(t);
  }
}, {
  decorations: (n) => n.decorations
});
class zg extends Ut {
  constructor(e) {
    super(), this.content = e;
  }
  toDOM(e) {
    let t = document.createElement("span");
    return t.className = "cm-placeholder", t.style.pointerEvents = "none", t.appendChild(typeof this.content == "string" ? document.createTextNode(this.content) : typeof this.content == "function" ? this.content(e) : this.content.cloneNode(!0)), t.setAttribute("aria-hidden", "true"), t;
  }
  coordsAt(e) {
    let t = e.firstChild ? sn(e.firstChild) : [];
    if (!t.length)
      return null;
    let i = window.getComputedStyle(e.parentNode), r = mn(t[0], i.direction != "rtl"), s = parseInt(i.lineHeight);
    return r.bottom - r.top > s * 1.5 ? { left: r.left, right: r.right, top: r.top, bottom: r.top + s } : r;
  }
  ignoreEvent() {
    return !1;
  }
}
function kx(n) {
  let e = re.fromClass(class {
    constructor(t) {
      this.view = t, this.placeholder = n ? A.set([A.widget({ widget: new zg(n), side: 1 }).range(0)]) : A.none;
    }
    get decorations() {
      return this.view.state.doc.length ? A.none : this.placeholder;
    }
  }, { decorations: (t) => t.decorations });
  return typeof n == "string" ? [
    e,
    T.contentAttributes.of({ "aria-placeholder": n })
  ] : e;
}
const Bo = 2e3;
function Mg(n, e, t) {
  let i = Math.min(e.line, t.line), r = Math.max(e.line, t.line), s = [];
  if (e.off > Bo || t.off > Bo || e.col < 0 || t.col < 0) {
    let o = Math.min(e.off, t.off), l = Math.max(e.off, t.off);
    for (let a = i; a <= r; a++) {
      let h = n.doc.line(a);
      h.length <= l && s.push(S.range(h.from + o, h.to + l));
    }
  } else {
    let o = Math.min(e.col, t.col), l = Math.max(e.col, t.col);
    for (let a = i; a <= r; a++) {
      let h = n.doc.line(a), O = wo(h.text, o, n.tabSize, !0);
      if (O < 0)
        s.push(S.cursor(h.to));
      else {
        let c = wo(h.text, l, n.tabSize);
        s.push(S.range(h.from + O, h.from + c));
      }
    }
  }
  return s;
}
function _g(n, e) {
  let t = n.coordsAtPos(n.viewport.from);
  return t ? Math.round(Math.abs((t.left - e) / n.defaultCharacterWidth)) : -1;
}
function lh(n, e) {
  let t = n.posAtCoords({ x: e.clientX, y: e.clientY }, !1), i = n.state.doc.lineAt(t), r = t - i.from, s = r > Bo ? -1 : r == i.length ? _g(n, e.clientX) : ct(i.text, n.state.tabSize, t - i.from);
  return { line: i.number, col: s, off: r };
}
function Eg(n, e) {
  let t = lh(n, e), i = n.state.selection;
  return t ? {
    update(r) {
      if (r.docChanged) {
        let s = r.changes.mapPos(r.startState.doc.line(t.line).from), o = r.state.doc.lineAt(s);
        t = { line: o.number, col: t.col, off: Math.min(t.off, o.length) }, i = i.map(r.changes);
      }
    },
    get(r, s, o) {
      let l = lh(n, r);
      if (!l)
        return i;
      let a = Mg(n.state, t, l);
      return a.length ? o ? S.create(a.concat(i.ranges)) : S.create(a) : i;
    }
  } : null;
}
function $x(n) {
  let e = n?.eventFilter || ((t) => t.altKey && t.button == 0);
  return T.mouseSelectionStyle.of((t, i) => e(i) ? Eg(t, i) : null);
}
const Lg = {
  Alt: [18, (n) => !!n.altKey],
  Control: [17, (n) => !!n.ctrlKey],
  Shift: [16, (n) => !!n.shiftKey],
  Meta: [91, (n) => !!n.metaKey]
}, Yg = { style: "cursor: crosshair" };
function xx(n = {}) {
  let [e, t] = Lg[n.key || "Alt"], i = re.fromClass(class {
    constructor(r) {
      this.view = r, this.isDown = !1;
    }
    set(r) {
      this.isDown != r && (this.isDown = r, this.view.update([]));
    }
  }, {
    eventObservers: {
      keydown(r) {
        this.set(r.keyCode == e || t(r));
      },
      keyup(r) {
        (r.keyCode == e || !t(r)) && this.set(!1);
      },
      mousemove(r) {
        this.set(t(r));
      }
    }
  });
  return [
    i,
    T.contentAttributes.of((r) => {
      var s;
      return !((s = r.plugin(i)) === null || s === void 0) && s.isDown ? Yg : null;
    })
  ];
}
const Fn = "-10000px";
class Vg {
  constructor(e, t, i, r) {
    this.facet = t, this.createTooltipView = i, this.removeTooltipView = r, this.input = e.state.facet(t), this.tooltips = this.input.filter((o) => o);
    let s = null;
    this.tooltipViews = this.tooltips.map((o) => s = i(o, s));
  }
  update(e, t) {
    var i;
    let r = e.state.facet(this.facet), s = r.filter((a) => a);
    if (r === this.input) {
      for (let a of this.tooltipViews)
        a.update && a.update(e);
      return !1;
    }
    let o = [], l = t ? [] : null;
    for (let a = 0; a < s.length; a++) {
      let h = s[a], O = -1;
      if (h) {
        for (let c = 0; c < this.tooltips.length; c++) {
          let f = this.tooltips[c];
          f && f.create == h.create && (O = c);
        }
        if (O < 0)
          o[a] = this.createTooltipView(h, a ? o[a - 1] : null), l && (l[a] = !!h.above);
        else {
          let c = o[a] = this.tooltipViews[O];
          l && (l[a] = t[O]), c.update && c.update(e);
        }
      }
    }
    for (let a of this.tooltipViews)
      o.indexOf(a) < 0 && (this.removeTooltipView(a), (i = a.destroy) === null || i === void 0 || i.call(a));
    return t && (l.forEach((a, h) => t[h] = a), t.length = l.length), this.input = r, this.tooltips = s, this.tooltipViews = o, !0;
  }
}
function Ug(n) {
  let e = n.dom.ownerDocument.documentElement;
  return { top: 0, left: 0, bottom: e.clientHeight, right: e.clientWidth };
}
const Rs = /* @__PURE__ */ X.define({
  combine: (n) => {
    var e, t, i;
    return {
      position: v.ios ? "absolute" : ((e = n.find((r) => r.position)) === null || e === void 0 ? void 0 : e.position) || "fixed",
      parent: ((t = n.find((r) => r.parent)) === null || t === void 0 ? void 0 : t.parent) || null,
      tooltipSpace: ((i = n.find((r) => r.tooltipSpace)) === null || i === void 0 ? void 0 : i.tooltipSpace) || Ug
    };
  }
}), ah = /* @__PURE__ */ new WeakMap(), mf = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.view = n, this.above = [], this.inView = !0, this.madeAbsolute = !1, this.lastTransaction = 0, this.measureTimeout = -1;
    let e = n.state.facet(Rs);
    this.position = e.position, this.parent = e.parent, this.classes = n.themeClasses, this.createContainer(), this.measureReq = { read: this.readMeasure.bind(this), write: this.writeMeasure.bind(this), key: this }, this.resizeObserver = typeof ResizeObserver == "function" ? new ResizeObserver(() => this.measureSoon()) : null, this.manager = new Vg(n, gf, (t, i) => this.createTooltip(t, i), (t) => {
      this.resizeObserver && this.resizeObserver.unobserve(t.dom), t.dom.remove();
    }), this.above = this.manager.tooltips.map((t) => !!t.above), this.intersectionObserver = typeof IntersectionObserver == "function" ? new IntersectionObserver((t) => {
      Date.now() > this.lastTransaction - 50 && t.length > 0 && t[t.length - 1].intersectionRatio < 1 && this.measureSoon();
    }, { threshold: [1] }) : null, this.observeIntersection(), n.win.addEventListener("resize", this.measureSoon = this.measureSoon.bind(this)), this.maybeMeasure();
  }
  createContainer() {
    this.parent ? (this.container = document.createElement("div"), this.container.style.position = "relative", this.container.className = this.view.themeClasses, this.parent.appendChild(this.container)) : this.container = this.view.dom;
  }
  observeIntersection() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      for (let n of this.manager.tooltipViews)
        this.intersectionObserver.observe(n.dom);
    }
  }
  measureSoon() {
    this.measureTimeout < 0 && (this.measureTimeout = setTimeout(() => {
      this.measureTimeout = -1, this.maybeMeasure();
    }, 50));
  }
  update(n) {
    n.transactions.length && (this.lastTransaction = Date.now());
    let e = this.manager.update(n, this.above);
    e && this.observeIntersection();
    let t = e || n.geometryChanged, i = n.state.facet(Rs);
    if (i.position != this.position && !this.madeAbsolute) {
      this.position = i.position;
      for (let r of this.manager.tooltipViews)
        r.dom.style.position = this.position;
      t = !0;
    }
    if (i.parent != this.parent) {
      this.parent && this.container.remove(), this.parent = i.parent, this.createContainer();
      for (let r of this.manager.tooltipViews)
        this.container.appendChild(r.dom);
      t = !0;
    } else this.parent && this.view.themeClasses != this.classes && (this.classes = this.container.className = this.view.themeClasses);
    t && this.maybeMeasure();
  }
  createTooltip(n, e) {
    let t = n.create(this.view), i = e ? e.dom : null;
    if (t.dom.classList.add("cm-tooltip"), n.arrow && !t.dom.querySelector(".cm-tooltip > .cm-tooltip-arrow")) {
      let r = document.createElement("div");
      r.className = "cm-tooltip-arrow", t.dom.appendChild(r);
    }
    return t.dom.style.position = this.position, t.dom.style.top = Fn, t.dom.style.left = "0px", this.container.insertBefore(t.dom, i), t.mount && t.mount(this.view), this.resizeObserver && this.resizeObserver.observe(t.dom), t;
  }
  destroy() {
    var n, e, t;
    this.view.win.removeEventListener("resize", this.measureSoon);
    for (let i of this.manager.tooltipViews)
      i.dom.remove(), (n = i.destroy) === null || n === void 0 || n.call(i);
    this.parent && this.container.remove(), (e = this.resizeObserver) === null || e === void 0 || e.disconnect(), (t = this.intersectionObserver) === null || t === void 0 || t.disconnect(), clearTimeout(this.measureTimeout);
  }
  readMeasure() {
    let n = 1, e = 1, t = !1;
    if (this.position == "fixed" && this.manager.tooltipViews.length) {
      let { dom: s } = this.manager.tooltipViews[0];
      if (v.safari) {
        let o = s.getBoundingClientRect();
        t = Math.abs(o.top + 1e4) > 1 || Math.abs(o.left) > 1;
      } else
        t = !!s.offsetParent && s.offsetParent != this.container.ownerDocument.body;
    }
    if (t || this.position == "absolute")
      if (this.parent) {
        let s = this.parent.getBoundingClientRect();
        s.width && s.height && (n = s.width / this.parent.offsetWidth, e = s.height / this.parent.offsetHeight);
      } else
        ({ scaleX: n, scaleY: e } = this.view.viewState);
    let i = this.view.scrollDOM.getBoundingClientRect(), r = vl(this.view);
    return {
      visible: {
        left: i.left + r.left,
        top: i.top + r.top,
        right: i.right - r.right,
        bottom: i.bottom - r.bottom
      },
      parent: this.parent ? this.container.getBoundingClientRect() : this.view.dom.getBoundingClientRect(),
      pos: this.manager.tooltips.map((s, o) => {
        let l = this.manager.tooltipViews[o];
        return l.getCoords ? l.getCoords(s.pos) : this.view.coordsAtPos(s.pos);
      }),
      size: this.manager.tooltipViews.map(({ dom: s }) => s.getBoundingClientRect()),
      space: this.view.state.facet(Rs).tooltipSpace(this.view),
      scaleX: n,
      scaleY: e,
      makeAbsolute: t
    };
  }
  writeMeasure(n) {
    var e;
    if (n.makeAbsolute) {
      this.madeAbsolute = !0, this.position = "absolute";
      for (let l of this.manager.tooltipViews)
        l.dom.style.position = "absolute";
    }
    let { visible: t, space: i, scaleX: r, scaleY: s } = n, o = [];
    for (let l = 0; l < this.manager.tooltips.length; l++) {
      let a = this.manager.tooltips[l], h = this.manager.tooltipViews[l], { dom: O } = h, c = n.pos[l], f = n.size[l];
      if (!c || a.clip !== !1 && (c.bottom <= Math.max(t.top, i.top) || c.top >= Math.min(t.bottom, i.bottom) || c.right < Math.max(t.left, i.left) - 0.1 || c.left > Math.min(t.right, i.right) + 0.1)) {
        O.style.top = Fn;
        continue;
      }
      let u = a.arrow ? h.dom.querySelector(".cm-tooltip-arrow") : null, d = u ? 7 : 0, p = f.right - f.left, g = (e = ah.get(h)) !== null && e !== void 0 ? e : f.bottom - f.top, Q = h.offset || Bg, b = this.view.textDirection == K.LTR, y = f.width > i.right - i.left ? b ? i.left : i.right - f.width : b ? Math.max(i.left, Math.min(c.left - (u ? 14 : 0) + Q.x, i.right - p)) : Math.min(Math.max(i.left, c.left - p + (u ? 14 : 0) - Q.x), i.right - p), C = this.above[l];
      !a.strictSide && (C ? c.top - g - d - Q.y < i.top : c.bottom + g + d + Q.y > i.bottom) && C == i.bottom - c.bottom > c.top - i.top && (C = this.above[l] = !C);
      let k = (C ? c.top - i.top : i.bottom - c.bottom) - d;
      if (k < g && h.resize !== !1) {
        if (k < this.view.defaultLineHeight) {
          O.style.top = Fn;
          continue;
        }
        ah.set(h, g), O.style.height = (g = k) / s + "px";
      } else O.style.height && (O.style.height = "");
      let x = C ? c.top - g - d - Q.y : c.bottom + d + Q.y, P = y + p;
      if (h.overlap !== !0)
        for (let j of o)
          j.left < P && j.right > y && j.top < x + g && j.bottom > x && (x = C ? j.top - g - 2 - d : j.bottom + d + 2);
      if (this.position == "absolute" ? (O.style.top = (x - n.parent.top) / s + "px", hh(O, (y - n.parent.left) / r)) : (O.style.top = x / s + "px", hh(O, y / r)), u) {
        let j = c.left + (b ? Q.x : -Q.x) - (y + 14 - 7);
        u.style.left = j / r + "px";
      }
      h.overlap !== !0 && o.push({ left: y, top: x, right: P, bottom: x + g }), O.classList.toggle("cm-tooltip-above", C), O.classList.toggle("cm-tooltip-below", !C), h.positioned && h.positioned(n.space);
    }
  }
  maybeMeasure() {
    if (this.manager.tooltips.length && (this.view.inView && this.view.requestMeasure(this.measureReq), this.inView != this.view.inView && (this.inView = this.view.inView, !this.inView)))
      for (let n of this.manager.tooltipViews)
        n.dom.style.top = Fn;
  }
}, {
  eventObservers: {
    scroll() {
      this.maybeMeasure();
    }
  }
});
function hh(n, e) {
  let t = parseInt(n.style.left, 10);
  (isNaN(t) || Math.abs(e - t) > 1) && (n.style.left = e + "px");
}
const Dg = /* @__PURE__ */ T.baseTheme({
  ".cm-tooltip": {
    zIndex: 500,
    boxSizing: "border-box"
  },
  "&light .cm-tooltip": {
    border: "1px solid #bbb",
    backgroundColor: "#f5f5f5"
  },
  "&light .cm-tooltip-section:not(:first-child)": {
    borderTop: "1px solid #bbb"
  },
  "&dark .cm-tooltip": {
    backgroundColor: "#333338",
    color: "white"
  },
  ".cm-tooltip-arrow": {
    height: "7px",
    width: `${7 * 2}px`,
    position: "absolute",
    zIndex: -1,
    overflow: "hidden",
    "&:before, &:after": {
      content: "''",
      position: "absolute",
      width: 0,
      height: 0,
      borderLeft: "7px solid transparent",
      borderRight: "7px solid transparent"
    },
    ".cm-tooltip-above &": {
      bottom: "-7px",
      "&:before": {
        borderTop: "7px solid #bbb"
      },
      "&:after": {
        borderTop: "7px solid #f5f5f5",
        bottom: "1px"
      }
    },
    ".cm-tooltip-below &": {
      top: "-7px",
      "&:before": {
        borderBottom: "7px solid #bbb"
      },
      "&:after": {
        borderBottom: "7px solid #f5f5f5",
        top: "1px"
      }
    }
  },
  "&dark .cm-tooltip .cm-tooltip-arrow": {
    "&:before": {
      borderTopColor: "#333338",
      borderBottomColor: "#333338"
    },
    "&:after": {
      borderTopColor: "transparent",
      borderBottomColor: "transparent"
    }
  }
}), Bg = { x: 0, y: 0 }, gf = /* @__PURE__ */ X.define({
  enables: [mf, Dg]
});
function Qf(n, e) {
  let t = n.plugin(mf);
  if (!t)
    return null;
  let i = t.manager.tooltips.indexOf(e);
  return i < 0 ? null : t.manager.tooltipViews[i];
}
const Oh = /* @__PURE__ */ X.define({
  combine(n) {
    let e, t;
    for (let i of n)
      e = e || i.topContainer, t = t || i.bottomContainer;
    return { topContainer: e, bottomContainer: t };
  }
});
function Zl(n, e) {
  let t = n.plugin(Sf), i = t ? t.specs.indexOf(e) : -1;
  return i > -1 ? t.panels[i] : null;
}
const Sf = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.input = n.state.facet(Rr), this.specs = this.input.filter((t) => t), this.panels = this.specs.map((t) => t(n));
    let e = n.state.facet(Oh);
    this.top = new Hn(n, !0, e.topContainer), this.bottom = new Hn(n, !1, e.bottomContainer), this.top.sync(this.panels.filter((t) => t.top)), this.bottom.sync(this.panels.filter((t) => !t.top));
    for (let t of this.panels)
      t.dom.classList.add("cm-panel"), t.mount && t.mount();
  }
  update(n) {
    let e = n.state.facet(Oh);
    this.top.container != e.topContainer && (this.top.sync([]), this.top = new Hn(n.view, !0, e.topContainer)), this.bottom.container != e.bottomContainer && (this.bottom.sync([]), this.bottom = new Hn(n.view, !1, e.bottomContainer)), this.top.syncClasses(), this.bottom.syncClasses();
    let t = n.state.facet(Rr);
    if (t != this.input) {
      let i = t.filter((a) => a), r = [], s = [], o = [], l = [];
      for (let a of i) {
        let h = this.specs.indexOf(a), O;
        h < 0 ? (O = a(n.view), l.push(O)) : (O = this.panels[h], O.update && O.update(n)), r.push(O), (O.top ? s : o).push(O);
      }
      this.specs = i, this.panels = r, this.top.sync(s), this.bottom.sync(o);
      for (let a of l)
        a.dom.classList.add("cm-panel"), a.mount && a.mount();
    } else
      for (let i of this.panels)
        i.update && i.update(n);
  }
  destroy() {
    this.top.sync([]), this.bottom.sync([]);
  }
}, {
  provide: (n) => T.scrollMargins.of((e) => {
    let t = e.plugin(n);
    return t && { top: t.top.scrollMargin(), bottom: t.bottom.scrollMargin() };
  })
});
class Hn {
  constructor(e, t, i) {
    this.view = e, this.top = t, this.container = i, this.dom = void 0, this.classes = "", this.panels = [], this.syncClasses();
  }
  sync(e) {
    for (let t of this.panels)
      t.destroy && e.indexOf(t) < 0 && t.destroy();
    this.panels = e, this.syncDOM();
  }
  syncDOM() {
    if (this.panels.length == 0) {
      this.dom && (this.dom.remove(), this.dom = void 0);
      return;
    }
    if (!this.dom) {
      this.dom = document.createElement("div"), this.dom.className = this.top ? "cm-panels cm-panels-top" : "cm-panels cm-panels-bottom";
      let t = this.container || this.view.dom;
      t.insertBefore(this.dom, this.top ? t.firstChild : null);
    }
    let e = this.dom.firstChild;
    for (let t of this.panels)
      if (t.dom.parentNode == this.dom) {
        for (; e != t.dom; )
          e = ch(e);
        e = e.nextSibling;
      } else
        this.dom.insertBefore(t.dom, e);
    for (; e; )
      e = ch(e);
  }
  scrollMargin() {
    return !this.dom || this.container ? 0 : Math.max(0, this.top ? this.dom.getBoundingClientRect().bottom - Math.max(0, this.view.scrollDOM.getBoundingClientRect().top) : Math.min(innerHeight, this.view.scrollDOM.getBoundingClientRect().bottom) - this.dom.getBoundingClientRect().top);
  }
  syncClasses() {
    if (!(!this.container || this.classes == this.view.themeClasses)) {
      for (let e of this.classes.split(" "))
        e && this.container.classList.remove(e);
      for (let e of (this.classes = this.view.themeClasses).split(" "))
        e && this.container.classList.add(e);
    }
  }
}
function ch(n) {
  let e = n.nextSibling;
  return n.remove(), e;
}
const Rr = /* @__PURE__ */ X.define({
  enables: Sf
});
function Ig(n, e) {
  let t, i = new Promise((o) => t = o), r = (o) => Ng(o, e, t);
  n.state.field(ur, !1) ? n.dispatch({ effects: bf.of(r) }) : n.dispatch({ effects: W.appendConfig.of(ur.init(() => [r])) });
  let s = yf.of(r);
  return { close: s, result: i.then((o) => ((n.win.queueMicrotask || ((a) => n.win.setTimeout(a, 10)))(() => {
    n.state.field(ur).indexOf(r) > -1 && n.dispatch({ effects: s });
  }), o)) };
}
function Gg(n, e) {
  let t = n.state.field(ur, !1) || [];
  for (let i of t) {
    let r = Zl(n, i);
    if (r && r.dom.classList.contains(e))
      return r;
  }
  return null;
}
const ur = /* @__PURE__ */ $e.define({
  create() {
    return [];
  },
  update(n, e) {
    for (let t of e.effects)
      t.is(bf) ? n = [t.value].concat(n) : t.is(yf) && (n = n.filter((i) => i != t.value));
    return n;
  },
  provide: (n) => Rr.computeN([n], (e) => e.field(n))
}), bf = /* @__PURE__ */ W.define(), yf = /* @__PURE__ */ W.define();
function Ng(n, e, t) {
  let i = e.content ? e.content(n, () => o(null)) : null;
  if (!i) {
    if (i = le("form"), e.input) {
      let l = le("input", e.input);
      /^(text|password|number|email|tel|url)$/.test(l.type) && l.classList.add("cm-textfield"), l.name || (l.name = "input"), i.appendChild(le("label", (e.label || "") + ": ", l));
    } else
      i.appendChild(document.createTextNode(e.label || ""));
    i.appendChild(document.createTextNode(" ")), i.appendChild(le("button", { class: "cm-button", type: "submit" }, e.submitLabel || "OK"));
  }
  let r = i.nodeName == "FORM" ? [i] : i.querySelectorAll("form");
  for (let l = 0; l < r.length; l++) {
    let a = r[l];
    a.addEventListener("keydown", (h) => {
      h.keyCode == 27 ? (h.preventDefault(), o(null)) : h.keyCode == 13 && (h.preventDefault(), o(a));
    }), a.addEventListener("submit", (h) => {
      h.preventDefault(), o(a);
    });
  }
  let s = le("div", i, le("button", {
    onclick: () => o(null),
    "aria-label": n.state.phrase("close"),
    class: "cm-dialog-close",
    type: "button"
  }, ["×"]));
  e.class && (s.className = e.class), s.classList.add("cm-dialog");
  function o(l) {
    s.contains(s.ownerDocument.activeElement) && n.focus(), t(l);
  }
  return {
    dom: s,
    top: e.top,
    mount: () => {
      if (e.focus) {
        let l;
        typeof e.focus == "string" ? l = i.querySelector(e.focus) : l = i.querySelector("input") || i.querySelector("button"), l && "select" in l ? l.select() : l && "focus" in l && l.focus();
      }
    }
  };
}
class $t extends jt {
  /**
  @internal
  */
  compare(e) {
    return this == e || this.constructor == e.constructor && this.eq(e);
  }
  /**
  Compare this marker to another marker of the same type.
  */
  eq(e) {
    return !1;
  }
  /**
  Called if the marker has a `toDOM` method and its representation
  was removed from a gutter.
  */
  destroy(e) {
  }
}
$t.prototype.elementClass = "";
$t.prototype.toDOM = void 0;
$t.prototype.mapMode = me.TrackBefore;
$t.prototype.startSide = $t.prototype.endSide = -1;
$t.prototype.point = !0;
const dr = /* @__PURE__ */ X.define(), Fg = /* @__PURE__ */ X.define(), Hg = {
  class: "",
  renderEmptyElements: !1,
  elementStyle: "",
  markers: () => _.empty,
  lineMarker: () => null,
  widgetMarker: () => null,
  lineMarkerChange: null,
  initialSpacer: null,
  updateSpacer: null,
  domEventHandlers: {},
  side: "before"
}, an = /* @__PURE__ */ X.define();
function Kg(n) {
  return [kf(), an.of({ ...Hg, ...n })];
}
const fh = /* @__PURE__ */ X.define({
  combine: (n) => n.some((e) => e)
});
function kf(n) {
  return [
    Jg
  ];
}
const Jg = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.view = n, this.domAfter = null, this.prevViewport = n.viewport, this.dom = document.createElement("div"), this.dom.className = "cm-gutters cm-gutters-before", this.dom.setAttribute("aria-hidden", "true"), this.dom.style.minHeight = this.view.contentHeight / this.view.scaleY + "px", this.gutters = n.state.facet(an).map((e) => new dh(n, e)), this.fixed = !n.state.facet(fh);
    for (let e of this.gutters)
      e.config.side == "after" ? this.getDOMAfter().appendChild(e.dom) : this.dom.appendChild(e.dom);
    this.fixed && (this.dom.style.position = "sticky"), this.syncGutters(!1), n.scrollDOM.insertBefore(this.dom, n.contentDOM);
  }
  getDOMAfter() {
    return this.domAfter || (this.domAfter = document.createElement("div"), this.domAfter.className = "cm-gutters cm-gutters-after", this.domAfter.setAttribute("aria-hidden", "true"), this.domAfter.style.minHeight = this.view.contentHeight / this.view.scaleY + "px", this.domAfter.style.position = this.fixed ? "sticky" : "", this.view.scrollDOM.appendChild(this.domAfter)), this.domAfter;
  }
  update(n) {
    if (this.updateGutters(n)) {
      let e = this.prevViewport, t = n.view.viewport, i = Math.min(e.to, t.to) - Math.max(e.from, t.from);
      this.syncGutters(i < (t.to - t.from) * 0.8);
    }
    if (n.geometryChanged) {
      let e = this.view.contentHeight / this.view.scaleY + "px";
      this.dom.style.minHeight = e, this.domAfter && (this.domAfter.style.minHeight = e);
    }
    this.view.state.facet(fh) != !this.fixed && (this.fixed = !this.fixed, this.dom.style.position = this.fixed ? "sticky" : "", this.domAfter && (this.domAfter.style.position = this.fixed ? "sticky" : "")), this.prevViewport = n.view.viewport;
  }
  syncGutters(n) {
    let e = this.dom.nextSibling;
    n && (this.dom.remove(), this.domAfter && this.domAfter.remove());
    let t = _.iter(this.view.state.facet(dr), this.view.viewport.from), i = [], r = this.gutters.map((s) => new e0(s, this.view.viewport, -this.view.documentPadding.top));
    for (let s of this.view.viewportLineBlocks)
      if (i.length && (i = []), Array.isArray(s.type)) {
        let o = !0;
        for (let l of s.type)
          if (l.type == ue.Text && o) {
            Io(t, i, l.from);
            for (let a of r)
              a.line(this.view, l, i);
            o = !1;
          } else if (l.widget)
            for (let a of r)
              a.widget(this.view, l);
      } else if (s.type == ue.Text) {
        Io(t, i, s.from);
        for (let o of r)
          o.line(this.view, s, i);
      } else if (s.widget)
        for (let o of r)
          o.widget(this.view, s);
    for (let s of r)
      s.finish();
    n && (this.view.scrollDOM.insertBefore(this.dom, e), this.domAfter && this.view.scrollDOM.appendChild(this.domAfter));
  }
  updateGutters(n) {
    let e = n.startState.facet(an), t = n.state.facet(an), i = n.docChanged || n.heightChanged || n.viewportChanged || !_.eq(n.startState.facet(dr), n.state.facet(dr), n.view.viewport.from, n.view.viewport.to);
    if (e == t)
      for (let r of this.gutters)
        r.update(n) && (i = !0);
    else {
      i = !0;
      let r = [];
      for (let s of t) {
        let o = e.indexOf(s);
        o < 0 ? r.push(new dh(this.view, s)) : (this.gutters[o].update(n), r.push(this.gutters[o]));
      }
      for (let s of this.gutters)
        s.dom.remove(), r.indexOf(s) < 0 && s.destroy();
      for (let s of r)
        s.config.side == "after" ? this.getDOMAfter().appendChild(s.dom) : this.dom.appendChild(s.dom);
      this.gutters = r;
    }
    return i;
  }
  destroy() {
    for (let n of this.gutters)
      n.destroy();
    this.dom.remove(), this.domAfter && this.domAfter.remove();
  }
}, {
  provide: (n) => T.scrollMargins.of((e) => {
    let t = e.plugin(n);
    if (!t || t.gutters.length == 0 || !t.fixed)
      return null;
    let i = t.dom.offsetWidth * e.scaleX, r = t.domAfter ? t.domAfter.offsetWidth * e.scaleX : 0;
    return e.textDirection == K.LTR ? { left: i, right: r } : { right: i, left: r };
  })
});
function uh(n) {
  return Array.isArray(n) ? n : [n];
}
function Io(n, e, t) {
  for (; n.value && n.from <= t; )
    n.from == t && e.push(n.value), n.next();
}
class e0 {
  constructor(e, t, i) {
    this.gutter = e, this.height = i, this.i = 0, this.cursor = _.iter(e.markers, t.from);
  }
  addElement(e, t, i) {
    let { gutter: r } = this, s = (t.top - this.height) / e.scaleY, o = t.height / e.scaleY;
    if (this.i == r.elements.length) {
      let l = new $f(e, o, s, i);
      r.elements.push(l), r.dom.appendChild(l.dom);
    } else
      r.elements[this.i].update(e, o, s, i);
    this.height = t.bottom, this.i++;
  }
  line(e, t, i) {
    let r = [];
    Io(this.cursor, r, t.from), i.length && (r = r.concat(i));
    let s = this.gutter.config.lineMarker(e, t, r);
    s && r.unshift(s);
    let o = this.gutter;
    r.length == 0 && !o.config.renderEmptyElements || this.addElement(e, t, r);
  }
  widget(e, t) {
    let i = this.gutter.config.widgetMarker(e, t.widget, t), r = i ? [i] : null;
    for (let s of e.state.facet(Fg)) {
      let o = s(e, t.widget, t);
      o && (r || (r = [])).push(o);
    }
    r && this.addElement(e, t, r);
  }
  finish() {
    let e = this.gutter;
    for (; e.elements.length > this.i; ) {
      let t = e.elements.pop();
      e.dom.removeChild(t.dom), t.destroy();
    }
  }
}
class dh {
  constructor(e, t) {
    this.view = e, this.config = t, this.elements = [], this.spacer = null, this.dom = document.createElement("div"), this.dom.className = "cm-gutter" + (this.config.class ? " " + this.config.class : "");
    for (let i in t.domEventHandlers)
      this.dom.addEventListener(i, (r) => {
        let s = r.target, o;
        if (s != this.dom && this.dom.contains(s)) {
          for (; s.parentNode != this.dom; )
            s = s.parentNode;
          let a = s.getBoundingClientRect();
          o = (a.top + a.bottom) / 2;
        } else
          o = r.clientY;
        let l = e.lineBlockAtHeight(o - e.documentTop);
        t.domEventHandlers[i](e, l, r) && r.preventDefault();
      });
    this.markers = uh(t.markers(e)), t.initialSpacer && (this.spacer = new $f(e, 0, 0, [t.initialSpacer(e)]), this.dom.appendChild(this.spacer.dom), this.spacer.dom.style.cssText += "visibility: hidden; pointer-events: none");
  }
  update(e) {
    let t = this.markers;
    if (this.markers = uh(this.config.markers(e.view)), this.spacer && this.config.updateSpacer) {
      let r = this.config.updateSpacer(this.spacer.markers[0], e);
      r != this.spacer.markers[0] && this.spacer.update(e.view, 0, 0, [r]);
    }
    let i = e.view.viewport;
    return !_.eq(this.markers, t, i.from, i.to) || (this.config.lineMarkerChange ? this.config.lineMarkerChange(e) : !1);
  }
  destroy() {
    for (let e of this.elements)
      e.destroy();
  }
}
class $f {
  constructor(e, t, i, r) {
    this.height = -1, this.above = 0, this.markers = [], this.dom = document.createElement("div"), this.dom.className = "cm-gutterElement", this.update(e, t, i, r);
  }
  update(e, t, i, r) {
    this.height != t && (this.height = t, this.dom.style.height = t + "px"), this.above != i && (this.dom.style.marginTop = (this.above = i) ? i + "px" : ""), t0(this.markers, r) || this.setMarkers(e, r);
  }
  setMarkers(e, t) {
    let i = "cm-gutterElement", r = this.dom.firstChild;
    for (let s = 0, o = 0; ; ) {
      let l = o, a = s < t.length ? t[s++] : null, h = !1;
      if (a) {
        let O = a.elementClass;
        O && (i += " " + O);
        for (let c = o; c < this.markers.length; c++)
          if (this.markers[c].compare(a)) {
            l = c, h = !0;
            break;
          }
      } else
        l = this.markers.length;
      for (; o < l; ) {
        let O = this.markers[o++];
        if (O.toDOM) {
          O.destroy(r);
          let c = r.nextSibling;
          r.remove(), r = c;
        }
      }
      if (!a)
        break;
      a.toDOM && (h ? r = r.nextSibling : this.dom.insertBefore(a.toDOM(e), r)), h && o++;
    }
    this.dom.className = i, this.markers = t;
  }
  destroy() {
    this.setMarkers(null, []);
  }
}
function t0(n, e) {
  if (n.length != e.length)
    return !1;
  for (let t = 0; t < n.length; t++)
    if (!n[t].compare(e[t]))
      return !1;
  return !0;
}
const i0 = /* @__PURE__ */ X.define(), n0 = /* @__PURE__ */ X.define(), Si = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, { formatNumber: String, domEventHandlers: {} }, {
      domEventHandlers(e, t) {
        let i = Object.assign({}, e);
        for (let r in t) {
          let s = i[r], o = t[r];
          i[r] = s ? (l, a, h) => s(l, a, h) || o(l, a, h) : o;
        }
        return i;
      }
    });
  }
});
class As extends $t {
  constructor(e) {
    super(), this.number = e;
  }
  eq(e) {
    return this.number == e.number;
  }
  toDOM() {
    return document.createTextNode(this.number);
  }
}
function qs(n, e) {
  return n.state.facet(Si).formatNumber(e, n.state);
}
const r0 = /* @__PURE__ */ an.compute([Si], (n) => ({
  class: "cm-lineNumbers",
  renderEmptyElements: !1,
  markers(e) {
    return e.state.facet(i0);
  },
  lineMarker(e, t, i) {
    return i.some((r) => r.toDOM) ? null : new As(qs(e, e.state.doc.lineAt(t.from).number));
  },
  widgetMarker: (e, t, i) => {
    for (let r of e.state.facet(n0)) {
      let s = r(e, t, i);
      if (s)
        return s;
    }
    return null;
  },
  lineMarkerChange: (e) => e.startState.facet(Si) != e.state.facet(Si),
  initialSpacer(e) {
    return new As(qs(e, ph(e.state.doc.lines)));
  },
  updateSpacer(e, t) {
    let i = qs(t.view, ph(t.view.state.doc.lines));
    return i == e.number ? e : new As(i);
  },
  domEventHandlers: n.facet(Si).domEventHandlers,
  side: "before"
}));
function Px(n = {}) {
  return [
    Si.of(n),
    kf(),
    r0
  ];
}
function ph(n) {
  let e = 9;
  for (; e < n; )
    e = e * 10 + 9;
  return e;
}
const s0 = /* @__PURE__ */ new class extends $t {
  constructor() {
    super(...arguments), this.elementClass = "cm-activeLineGutter";
  }
}(), o0 = /* @__PURE__ */ dr.compute(["selection"], (n) => {
  let e = [], t = -1;
  for (let i of n.selection.ranges) {
    let r = n.doc.lineAt(i.head).from;
    r > t && (t = r, e.push(s0.range(r)));
  }
  return _.of(e);
});
function wx() {
  return o0;
}
const xf = 1024;
let l0 = 0;
class Ee {
  constructor(e, t) {
    this.from = e, this.to = t;
  }
}
class q {
  /**
  Create a new node prop type.
  */
  constructor(e = {}) {
    this.id = l0++, this.perNode = !!e.perNode, this.deserialize = e.deserialize || (() => {
      throw new Error("This node type doesn't define a deserialize function");
    }), this.combine = e.combine || null;
  }
  /**
  This is meant to be used with
  [`NodeSet.extend`](#common.NodeSet.extend) or
  [`LRParser.configure`](#lr.ParserConfig.props) to compute
  prop values for each node type in the set. Takes a [match
  object](#common.NodeType^match) or function that returns undefined
  if the node type doesn't get this prop, and the prop's value if
  it does.
  */
  add(e) {
    if (this.perNode)
      throw new RangeError("Can't add per-node props to node types");
    return typeof e != "function" && (e = se.match(e)), (t) => {
      let i = e(t);
      return i === void 0 ? null : [this, i];
    };
  }
}
q.closedBy = new q({ deserialize: (n) => n.split(" ") });
q.openedBy = new q({ deserialize: (n) => n.split(" ") });
q.group = new q({ deserialize: (n) => n.split(" ") });
q.isolate = new q({ deserialize: (n) => {
  if (n && n != "rtl" && n != "ltr" && n != "auto")
    throw new RangeError("Invalid value for isolate: " + n);
  return n || "auto";
} });
q.contextHash = new q({ perNode: !0 });
q.lookAhead = new q({ perNode: !0 });
q.mounted = new q({ perNode: !0 });
class Pi {
  constructor(e, t, i, r = !1) {
    this.tree = e, this.overlay = t, this.parser = i, this.bracketed = r;
  }
  /**
  @internal
  */
  static get(e) {
    return e && e.props && e.props[q.mounted.id];
  }
}
const a0 = /* @__PURE__ */ Object.create(null);
class se {
  /**
  @internal
  */
  constructor(e, t, i, r = 0) {
    this.name = e, this.props = t, this.id = i, this.flags = r;
  }
  /**
  Define a node type.
  */
  static define(e) {
    let t = e.props && e.props.length ? /* @__PURE__ */ Object.create(null) : a0, i = (e.top ? 1 : 0) | (e.skipped ? 2 : 0) | (e.error ? 4 : 0) | (e.name == null ? 8 : 0), r = new se(e.name || "", t, e.id, i);
    if (e.props) {
      for (let s of e.props)
        if (Array.isArray(s) || (s = s(r)), s) {
          if (s[0].perNode)
            throw new RangeError("Can't store a per-node prop on a node type");
          t[s[0].id] = s[1];
        }
    }
    return r;
  }
  /**
  Retrieves a node prop for this type. Will return `undefined` if
  the prop isn't present on this node.
  */
  prop(e) {
    return this.props[e.id];
  }
  /**
  True when this is the top node of a grammar.
  */
  get isTop() {
    return (this.flags & 1) > 0;
  }
  /**
  True when this node is produced by a skip rule.
  */
  get isSkipped() {
    return (this.flags & 2) > 0;
  }
  /**
  Indicates whether this is an error node.
  */
  get isError() {
    return (this.flags & 4) > 0;
  }
  /**
  When true, this node type doesn't correspond to a user-declared
  named node, for example because it is used to cache repetition.
  */
  get isAnonymous() {
    return (this.flags & 8) > 0;
  }
  /**
  Returns true when this node's name or one of its
  [groups](#common.NodeProp^group) matches the given string.
  */
  is(e) {
    if (typeof e == "string") {
      if (this.name == e)
        return !0;
      let t = this.prop(q.group);
      return t ? t.indexOf(e) > -1 : !1;
    }
    return this.id == e;
  }
  /**
  Create a function from node types to arbitrary values by
  specifying an object whose property names are node or
  [group](#common.NodeProp^group) names. Often useful with
  [`NodeProp.add`](#common.NodeProp.add). You can put multiple
  names, separated by spaces, in a single property name to map
  multiple node names to a single value.
  */
  static match(e) {
    let t = /* @__PURE__ */ Object.create(null);
    for (let i in e)
      for (let r of i.split(" "))
        t[r] = e[i];
    return (i) => {
      for (let r = i.prop(q.group), s = -1; s < (r ? r.length : 0); s++) {
        let o = t[s < 0 ? i.name : r[s]];
        if (o)
          return o;
      }
    };
  }
}
se.none = new se(
  "",
  /* @__PURE__ */ Object.create(null),
  0,
  8
  /* NodeFlag.Anonymous */
);
class _i {
  /**
  Create a set with the given types. The `id` property of each
  type should correspond to its position within the array.
  */
  constructor(e) {
    this.types = e;
    for (let t = 0; t < e.length; t++)
      if (e[t].id != t)
        throw new RangeError("Node type ids should correspond to array positions when creating a node set");
  }
  /**
  Create a copy of this set with some node properties added. The
  arguments to this method can be created with
  [`NodeProp.add`](#common.NodeProp.add).
  */
  extend(...e) {
    let t = [];
    for (let i of this.types) {
      let r = null;
      for (let s of e) {
        let o = s(i);
        if (o) {
          r || (r = Object.assign({}, i.props));
          let l = o[1], a = o[0];
          a.combine && a.id in r && (l = a.combine(r[a.id], l)), r[a.id] = l;
        }
      }
      t.push(r ? new se(i.name, r, i.id, i.flags) : i);
    }
    return new _i(t);
  }
}
const Kn = /* @__PURE__ */ new WeakMap(), mh = /* @__PURE__ */ new WeakMap();
var V;
(function(n) {
  n[n.ExcludeBuffers = 1] = "ExcludeBuffers", n[n.IncludeAnonymous = 2] = "IncludeAnonymous", n[n.IgnoreMounts = 4] = "IgnoreMounts", n[n.IgnoreOverlays = 8] = "IgnoreOverlays", n[n.EnterBracketed = 16] = "EnterBracketed";
})(V || (V = {}));
class z {
  /**
  Construct a new tree. See also [`Tree.build`](#common.Tree^build).
  */
  constructor(e, t, i, r, s) {
    if (this.type = e, this.children = t, this.positions = i, this.length = r, this.props = null, s && s.length) {
      this.props = /* @__PURE__ */ Object.create(null);
      for (let [o, l] of s)
        this.props[typeof o == "number" ? o : o.id] = l;
    }
  }
  /**
  @internal
  */
  toString() {
    let e = Pi.get(this);
    if (e && !e.overlay)
      return e.tree.toString();
    let t = "";
    for (let i of this.children) {
      let r = i.toString();
      r && (t && (t += ","), t += r);
    }
    return this.type.name ? (/\W/.test(this.type.name) && !this.type.isError ? JSON.stringify(this.type.name) : this.type.name) + (t.length ? "(" + t + ")" : "") : t;
  }
  /**
  Get a [tree cursor](#common.TreeCursor) positioned at the top of
  the tree. Mode can be used to [control](#common.IterMode) which
  nodes the cursor visits.
  */
  cursor(e = 0) {
    return new Ar(this.topNode, e);
  }
  /**
  Get a [tree cursor](#common.TreeCursor) pointing into this tree
  at the given position and side (see
  [`moveTo`](#common.TreeCursor.moveTo).
  */
  cursorAt(e, t = 0, i = 0) {
    let r = Kn.get(this) || this.topNode, s = new Ar(r);
    return s.moveTo(e, t), Kn.set(this, s._tree), s;
  }
  /**
  Get a [syntax node](#common.SyntaxNode) object for the top of the
  tree.
  */
  get topNode() {
    return new ge(this, 0, 0, null);
  }
  /**
  Get the [syntax node](#common.SyntaxNode) at the given position.
  If `side` is -1, this will move into nodes that end at the
  position. If 1, it'll move into nodes that start at the
  position. With 0, it'll only enter nodes that cover the position
  from both sides.
  
  Note that this will not enter
  [overlays](#common.MountedTree.overlay), and you often want
  [`resolveInner`](#common.Tree.resolveInner) instead.
  */
  resolve(e, t = 0) {
    let i = Qn(Kn.get(this) || this.topNode, e, t, !1);
    return Kn.set(this, i), i;
  }
  /**
  Like [`resolve`](#common.Tree.resolve), but will enter
  [overlaid](#common.MountedTree.overlay) nodes, producing a syntax node
  pointing into the innermost overlaid tree at the given position
  (with parent links going through all parent structure, including
  the host trees).
  */
  resolveInner(e, t = 0) {
    let i = Qn(mh.get(this) || this.topNode, e, t, !0);
    return mh.set(this, i), i;
  }
  /**
  In some situations, it can be useful to iterate through all
  nodes around a position, including those in overlays that don't
  directly cover the position. This method gives you an iterator
  that will produce all nodes, from small to big, around the given
  position.
  */
  resolveStack(e, t = 0) {
    return c0(this, e, t);
  }
  /**
  Iterate over the tree and its children, calling `enter` for any
  node that touches the `from`/`to` region (if given) before
  running over such a node's children, and `leave` (if given) when
  leaving the node. When `enter` returns `false`, that node will
  not have its children iterated over (or `leave` called).
  */
  iterate(e) {
    let { enter: t, leave: i, from: r = 0, to: s = this.length } = e, o = e.mode || 0, l = (o & V.IncludeAnonymous) > 0;
    for (let a = this.cursor(o | V.IncludeAnonymous); ; ) {
      let h = !1;
      if (a.from <= s && a.to >= r && (!l && a.type.isAnonymous || t(a) !== !1)) {
        if (a.firstChild())
          continue;
        h = !0;
      }
      for (; h && i && (l || !a.type.isAnonymous) && i(a), !a.nextSibling(); ) {
        if (!a.parent())
          return;
        h = !0;
      }
    }
  }
  /**
  Get the value of the given [node prop](#common.NodeProp) for this
  node. Works with both per-node and per-type props.
  */
  prop(e) {
    return e.perNode ? this.props ? this.props[e.id] : void 0 : this.type.prop(e);
  }
  /**
  Returns the node's [per-node props](#common.NodeProp.perNode) in a
  format that can be passed to the [`Tree`](#common.Tree)
  constructor.
  */
  get propValues() {
    let e = [];
    if (this.props)
      for (let t in this.props)
        e.push([+t, this.props[t]]);
    return e;
  }
  /**
  Balance the direct children of this tree, producing a copy of
  which may have children grouped into subtrees with type
  [`NodeType.none`](#common.NodeType^none).
  */
  balance(e = {}) {
    return this.children.length <= 8 ? this : ql(se.none, this.children, this.positions, 0, this.children.length, 0, this.length, (t, i, r) => new z(this.type, t, i, r, this.propValues), e.makeTree || ((t, i, r) => new z(se.none, t, i, r)));
  }
  /**
  Build a tree from a postfix-ordered buffer of node information,
  or a cursor over such a buffer.
  */
  static build(e) {
    return f0(e);
  }
}
z.empty = new z(se.none, [], [], 0);
class Rl {
  constructor(e, t) {
    this.buffer = e, this.index = t;
  }
  get id() {
    return this.buffer[this.index - 4];
  }
  get start() {
    return this.buffer[this.index - 3];
  }
  get end() {
    return this.buffer[this.index - 2];
  }
  get size() {
    return this.buffer[this.index - 1];
  }
  get pos() {
    return this.index;
  }
  next() {
    this.index -= 4;
  }
  fork() {
    return new Rl(this.buffer, this.index);
  }
}
class _t {
  /**
  Create a tree buffer.
  */
  constructor(e, t, i) {
    this.buffer = e, this.length = t, this.set = i;
  }
  /**
  @internal
  */
  get type() {
    return se.none;
  }
  /**
  @internal
  */
  toString() {
    let e = [];
    for (let t = 0; t < this.buffer.length; )
      e.push(this.childString(t)), t = this.buffer[t + 3];
    return e.join(",");
  }
  /**
  @internal
  */
  childString(e) {
    let t = this.buffer[e], i = this.buffer[e + 3], r = this.set.types[t], s = r.name;
    if (/\W/.test(s) && !r.isError && (s = JSON.stringify(s)), e += 4, i == e)
      return s;
    let o = [];
    for (; e < i; )
      o.push(this.childString(e)), e = this.buffer[e + 3];
    return s + "(" + o.join(",") + ")";
  }
  /**
  @internal
  */
  findChild(e, t, i, r, s) {
    let { buffer: o } = this, l = -1;
    for (let a = e; a != t && !(Pf(s, r, o[a + 1], o[a + 2]) && (l = a, i > 0)); a = o[a + 3])
      ;
    return l;
  }
  /**
  @internal
  */
  slice(e, t, i) {
    let r = this.buffer, s = new Uint16Array(t - e), o = 0;
    for (let l = e, a = 0; l < t; ) {
      s[a++] = r[l++], s[a++] = r[l++] - i;
      let h = s[a++] = r[l++] - i;
      s[a++] = r[l++] - e, o = Math.max(o, h);
    }
    return new _t(s, o, this.set);
  }
}
function Pf(n, e, t, i) {
  switch (n) {
    case -2:
      return t < e;
    case -1:
      return i >= e && t < e;
    case 0:
      return t < e && i > e;
    case 1:
      return t <= e && i > e;
    case 2:
      return i > e;
    case 4:
      return !0;
  }
}
function Qn(n, e, t, i) {
  for (var r; n.from == n.to || (t < 1 ? n.from >= e : n.from > e) || (t > -1 ? n.to <= e : n.to < e); ) {
    let o = !i && n instanceof ge && n.index < 0 ? null : n.parent;
    if (!o)
      return n;
    n = o;
  }
  let s = i ? 0 : V.IgnoreOverlays;
  if (i)
    for (let o = n, l = o.parent; l; o = l, l = o.parent)
      o instanceof ge && o.index < 0 && ((r = l.enter(e, t, s)) === null || r === void 0 ? void 0 : r.from) != o.from && (n = l);
  for (; ; ) {
    let o = n.enter(e, t, s);
    if (!o)
      return n;
    n = o;
  }
}
class wf {
  cursor(e = 0) {
    return new Ar(this, e);
  }
  getChild(e, t = null, i = null) {
    let r = gh(this, e, t, i);
    return r.length ? r[0] : null;
  }
  getChildren(e, t = null, i = null) {
    return gh(this, e, t, i);
  }
  resolve(e, t = 0) {
    return Qn(this, e, t, !1);
  }
  resolveInner(e, t = 0) {
    return Qn(this, e, t, !0);
  }
  matchContext(e) {
    return Go(this.parent, e);
  }
  enterUnfinishedNodesBefore(e) {
    let t = this.childBefore(e), i = this;
    for (; t; ) {
      let r = t.lastChild;
      if (!r || r.to != t.to)
        break;
      r.type.isError && r.from == r.to ? (i = t, t = r.prevSibling) : t = r;
    }
    return i;
  }
  get node() {
    return this;
  }
  get next() {
    return this.parent;
  }
}
class ge extends wf {
  constructor(e, t, i, r) {
    super(), this._tree = e, this.from = t, this.index = i, this._parent = r;
  }
  get type() {
    return this._tree.type;
  }
  get name() {
    return this._tree.type.name;
  }
  get to() {
    return this.from + this._tree.length;
  }
  nextChild(e, t, i, r, s = 0) {
    for (let o = this; ; ) {
      for (let { children: l, positions: a } = o._tree, h = t > 0 ? l.length : -1; e != h; e += t) {
        let O = l[e], c = a[e] + o.from, f;
        if (!(!(s & V.EnterBracketed && O instanceof z && (f = Pi.get(O)) && !f.overlay && f.bracketed && i >= c && i <= c + O.length) && !Pf(r, i, c, c + O.length))) {
          if (O instanceof _t) {
            if (s & V.ExcludeBuffers)
              continue;
            let u = O.findChild(0, O.buffer.length, t, i - c, r);
            if (u > -1)
              return new ot(new h0(o, O, e, c), null, u);
          } else if (s & V.IncludeAnonymous || !O.type.isAnonymous || Al(O)) {
            let u;
            if (!(s & V.IgnoreMounts) && (u = Pi.get(O)) && !u.overlay)
              return new ge(u.tree, c, e, o);
            let d = new ge(O, c, e, o);
            return s & V.IncludeAnonymous || !d.type.isAnonymous ? d : d.nextChild(t < 0 ? O.children.length - 1 : 0, t, i, r, s);
          }
        }
      }
      if (s & V.IncludeAnonymous || !o.type.isAnonymous || (o.index >= 0 ? e = o.index + t : e = t < 0 ? -1 : o._parent._tree.children.length, o = o._parent, !o))
        return null;
    }
  }
  get firstChild() {
    return this.nextChild(
      0,
      1,
      0,
      4
      /* Side.DontCare */
    );
  }
  get lastChild() {
    return this.nextChild(
      this._tree.children.length - 1,
      -1,
      0,
      4
      /* Side.DontCare */
    );
  }
  childAfter(e) {
    return this.nextChild(
      0,
      1,
      e,
      2
      /* Side.After */
    );
  }
  childBefore(e) {
    return this.nextChild(
      this._tree.children.length - 1,
      -1,
      e,
      -2
      /* Side.Before */
    );
  }
  prop(e) {
    return this._tree.prop(e);
  }
  enter(e, t, i = 0) {
    let r;
    if (!(i & V.IgnoreOverlays) && (r = Pi.get(this._tree)) && r.overlay) {
      let s = e - this.from, o = i & V.EnterBracketed && r.bracketed;
      for (let { from: l, to: a } of r.overlay)
        if ((t > 0 || o ? l <= s : l < s) && (t < 0 || o ? a >= s : a > s))
          return new ge(r.tree, r.overlay[0].from + this.from, -1, this);
    }
    return this.nextChild(0, 1, e, t, i);
  }
  nextSignificantParent() {
    let e = this;
    for (; e.type.isAnonymous && e._parent; )
      e = e._parent;
    return e;
  }
  get parent() {
    return this._parent ? this._parent.nextSignificantParent() : null;
  }
  get nextSibling() {
    return this._parent && this.index >= 0 ? this._parent.nextChild(
      this.index + 1,
      1,
      0,
      4
      /* Side.DontCare */
    ) : null;
  }
  get prevSibling() {
    return this._parent && this.index >= 0 ? this._parent.nextChild(
      this.index - 1,
      -1,
      0,
      4
      /* Side.DontCare */
    ) : null;
  }
  get tree() {
    return this._tree;
  }
  toTree() {
    return this._tree;
  }
  /**
  @internal
  */
  toString() {
    return this._tree.toString();
  }
}
function gh(n, e, t, i) {
  let r = n.cursor(), s = [];
  if (!r.firstChild())
    return s;
  if (t != null) {
    for (let o = !1; !o; )
      if (o = r.type.is(t), !r.nextSibling())
        return s;
  }
  for (; ; ) {
    if (i != null && r.type.is(i))
      return s;
    if (r.type.is(e) && s.push(r.node), !r.nextSibling())
      return i == null ? s : [];
  }
}
function Go(n, e, t = e.length - 1) {
  for (let i = n; t >= 0; i = i.parent) {
    if (!i)
      return !1;
    if (!i.type.isAnonymous) {
      if (e[t] && e[t] != i.name)
        return !1;
      t--;
    }
  }
  return !0;
}
class h0 {
  constructor(e, t, i, r) {
    this.parent = e, this.buffer = t, this.index = i, this.start = r;
  }
}
class ot extends wf {
  get name() {
    return this.type.name;
  }
  get from() {
    return this.context.start + this.context.buffer.buffer[this.index + 1];
  }
  get to() {
    return this.context.start + this.context.buffer.buffer[this.index + 2];
  }
  constructor(e, t, i) {
    super(), this.context = e, this._parent = t, this.index = i, this.type = e.buffer.set.types[e.buffer.buffer[i]];
  }
  child(e, t, i) {
    let { buffer: r } = this.context, s = r.findChild(this.index + 4, r.buffer[this.index + 3], e, t - this.context.start, i);
    return s < 0 ? null : new ot(this.context, this, s);
  }
  get firstChild() {
    return this.child(
      1,
      0,
      4
      /* Side.DontCare */
    );
  }
  get lastChild() {
    return this.child(
      -1,
      0,
      4
      /* Side.DontCare */
    );
  }
  childAfter(e) {
    return this.child(
      1,
      e,
      2
      /* Side.After */
    );
  }
  childBefore(e) {
    return this.child(
      -1,
      e,
      -2
      /* Side.Before */
    );
  }
  prop(e) {
    return this.type.prop(e);
  }
  enter(e, t, i = 0) {
    if (i & V.ExcludeBuffers)
      return null;
    let { buffer: r } = this.context, s = r.findChild(this.index + 4, r.buffer[this.index + 3], t > 0 ? 1 : -1, e - this.context.start, t);
    return s < 0 ? null : new ot(this.context, this, s);
  }
  get parent() {
    return this._parent || this.context.parent.nextSignificantParent();
  }
  externalSibling(e) {
    return this._parent ? null : this.context.parent.nextChild(
      this.context.index + e,
      e,
      0,
      4
      /* Side.DontCare */
    );
  }
  get nextSibling() {
    let { buffer: e } = this.context, t = e.buffer[this.index + 3];
    return t < (this._parent ? e.buffer[this._parent.index + 3] : e.buffer.length) ? new ot(this.context, this._parent, t) : this.externalSibling(1);
  }
  get prevSibling() {
    let { buffer: e } = this.context, t = this._parent ? this._parent.index + 4 : 0;
    return this.index == t ? this.externalSibling(-1) : new ot(this.context, this._parent, e.findChild(
      t,
      this.index,
      -1,
      0,
      4
      /* Side.DontCare */
    ));
  }
  get tree() {
    return null;
  }
  toTree() {
    let e = [], t = [], { buffer: i } = this.context, r = this.index + 4, s = i.buffer[this.index + 3];
    if (s > r) {
      let o = i.buffer[this.index + 1];
      e.push(i.slice(r, s, o)), t.push(0);
    }
    return new z(this.type, e, t, this.to - this.from);
  }
  /**
  @internal
  */
  toString() {
    return this.context.buffer.childString(this.index);
  }
}
function vf(n) {
  if (!n.length)
    return null;
  let e = 0, t = n[0];
  for (let s = 1; s < n.length; s++) {
    let o = n[s];
    (o.from > t.from || o.to < t.to) && (t = o, e = s);
  }
  let i = t instanceof ge && t.index < 0 ? null : t.parent, r = n.slice();
  return i ? r[e] = i : r.splice(e, 1), new O0(r, t);
}
class O0 {
  constructor(e, t) {
    this.heads = e, this.node = t;
  }
  get next() {
    return vf(this.heads);
  }
}
function c0(n, e, t) {
  let i = n.resolveInner(e, t), r = null;
  for (let s = i instanceof ge ? i : i.context.parent; s; s = s.parent)
    if (s.index < 0) {
      let o = s.parent;
      (r || (r = [i])).push(o.resolve(e, t)), s = o;
    } else {
      let o = Pi.get(s.tree);
      if (o && o.overlay && o.overlay[0].from <= e && o.overlay[o.overlay.length - 1].to >= e) {
        let l = new ge(o.tree, o.overlay[0].from + s.from, -1, s);
        (r || (r = [i])).push(Qn(l, e, t, !1));
      }
    }
  return r ? vf(r) : i;
}
class Ar {
  /**
  Shorthand for `.type.name`.
  */
  get name() {
    return this.type.name;
  }
  /**
  @internal
  */
  constructor(e, t = 0) {
    if (this.buffer = null, this.stack = [], this.index = 0, this.bufferNode = null, this.mode = t & ~V.EnterBracketed, e instanceof ge)
      this.yieldNode(e);
    else {
      this._tree = e.context.parent, this.buffer = e.context;
      for (let i = e._parent; i; i = i._parent)
        this.stack.unshift(i.index);
      this.bufferNode = e, this.yieldBuf(e.index);
    }
  }
  yieldNode(e) {
    return e ? (this._tree = e, this.type = e.type, this.from = e.from, this.to = e.to, !0) : !1;
  }
  yieldBuf(e, t) {
    this.index = e;
    let { start: i, buffer: r } = this.buffer;
    return this.type = t || r.set.types[r.buffer[e]], this.from = i + r.buffer[e + 1], this.to = i + r.buffer[e + 2], !0;
  }
  /**
  @internal
  */
  yield(e) {
    return e ? e instanceof ge ? (this.buffer = null, this.yieldNode(e)) : (this.buffer = e.context, this.yieldBuf(e.index, e.type)) : !1;
  }
  /**
  @internal
  */
  toString() {
    return this.buffer ? this.buffer.buffer.childString(this.index) : this._tree.toString();
  }
  /**
  @internal
  */
  enterChild(e, t, i) {
    if (!this.buffer)
      return this.yield(this._tree.nextChild(e < 0 ? this._tree._tree.children.length - 1 : 0, e, t, i, this.mode));
    let { buffer: r } = this.buffer, s = r.findChild(this.index + 4, r.buffer[this.index + 3], e, t - this.buffer.start, i);
    return s < 0 ? !1 : (this.stack.push(this.index), this.yieldBuf(s));
  }
  /**
  Move the cursor to this node's first child. When this returns
  false, the node has no child, and the cursor has not been moved.
  */
  firstChild() {
    return this.enterChild(
      1,
      0,
      4
      /* Side.DontCare */
    );
  }
  /**
  Move the cursor to this node's last child.
  */
  lastChild() {
    return this.enterChild(
      -1,
      0,
      4
      /* Side.DontCare */
    );
  }
  /**
  Move the cursor to the first child that ends after `pos`.
  */
  childAfter(e) {
    return this.enterChild(
      1,
      e,
      2
      /* Side.After */
    );
  }
  /**
  Move to the last child that starts before `pos`.
  */
  childBefore(e) {
    return this.enterChild(
      -1,
      e,
      -2
      /* Side.Before */
    );
  }
  /**
  Move the cursor to the child around `pos`. If side is -1 the
  child may end at that position, when 1 it may start there. This
  will also enter [overlaid](#common.MountedTree.overlay)
  [mounted](#common.NodeProp^mounted) trees unless `overlays` is
  set to false.
  */
  enter(e, t, i = this.mode) {
    return this.buffer ? i & V.ExcludeBuffers ? !1 : this.enterChild(1, e, t) : this.yield(this._tree.enter(e, t, i));
  }
  /**
  Move to the node's parent node, if this isn't the top node.
  */
  parent() {
    if (!this.buffer)
      return this.yieldNode(this.mode & V.IncludeAnonymous ? this._tree._parent : this._tree.parent);
    if (this.stack.length)
      return this.yieldBuf(this.stack.pop());
    let e = this.mode & V.IncludeAnonymous ? this.buffer.parent : this.buffer.parent.nextSignificantParent();
    return this.buffer = null, this.yieldNode(e);
  }
  /**
  @internal
  */
  sibling(e) {
    if (!this.buffer)
      return this._tree._parent ? this.yield(this._tree.index < 0 ? null : this._tree._parent.nextChild(this._tree.index + e, e, 0, 4, this.mode)) : !1;
    let { buffer: t } = this.buffer, i = this.stack.length - 1;
    if (e < 0) {
      let r = i < 0 ? 0 : this.stack[i] + 4;
      if (this.index != r)
        return this.yieldBuf(t.findChild(
          r,
          this.index,
          -1,
          0,
          4
          /* Side.DontCare */
        ));
    } else {
      let r = t.buffer[this.index + 3];
      if (r < (i < 0 ? t.buffer.length : t.buffer[this.stack[i] + 3]))
        return this.yieldBuf(r);
    }
    return i < 0 ? this.yield(this.buffer.parent.nextChild(this.buffer.index + e, e, 0, 4, this.mode)) : !1;
  }
  /**
  Move to this node's next sibling, if any.
  */
  nextSibling() {
    return this.sibling(1);
  }
  /**
  Move to this node's previous sibling, if any.
  */
  prevSibling() {
    return this.sibling(-1);
  }
  atLastNode(e) {
    let t, i, { buffer: r } = this;
    if (r) {
      if (e > 0) {
        if (this.index < r.buffer.buffer.length)
          return !1;
      } else
        for (let s = 0; s < this.index; s++)
          if (r.buffer.buffer[s + 3] < this.index)
            return !1;
      ({ index: t, parent: i } = r);
    } else
      ({ index: t, _parent: i } = this._tree);
    for (; i; { index: t, _parent: i } = i)
      if (t > -1)
        for (let s = t + e, o = e < 0 ? -1 : i._tree.children.length; s != o; s += e) {
          let l = i._tree.children[s];
          if (this.mode & V.IncludeAnonymous || l instanceof _t || !l.type.isAnonymous || Al(l))
            return !1;
        }
    return !0;
  }
  move(e, t) {
    if (t && this.enterChild(
      e,
      0,
      4
      /* Side.DontCare */
    ))
      return !0;
    for (; ; ) {
      if (this.sibling(e))
        return !0;
      if (this.atLastNode(e) || !this.parent())
        return !1;
    }
  }
  /**
  Move to the next node in a
  [pre-order](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order,_NLR)
  traversal, going from a node to its first child or, if the
  current node is empty or `enter` is false, its next sibling or
  the next sibling of the first parent node that has one.
  */
  next(e = !0) {
    return this.move(1, e);
  }
  /**
  Move to the next node in a last-to-first pre-order traversal. A
  node is followed by its last child or, if it has none, its
  previous sibling or the previous sibling of the first parent
  node that has one.
  */
  prev(e = !0) {
    return this.move(-1, e);
  }
  /**
  Move the cursor to the innermost node that covers `pos`. If
  `side` is -1, it will enter nodes that end at `pos`. If it is 1,
  it will enter nodes that start at `pos`.
  */
  moveTo(e, t = 0) {
    for (; (this.from == this.to || (t < 1 ? this.from >= e : this.from > e) || (t > -1 ? this.to <= e : this.to < e)) && this.parent(); )
      ;
    for (; this.enterChild(1, e, t); )
      ;
    return this;
  }
  /**
  Get a [syntax node](#common.SyntaxNode) at the cursor's current
  position.
  */
  get node() {
    if (!this.buffer)
      return this._tree;
    let e = this.bufferNode, t = null, i = 0;
    if (e && e.context == this.buffer)
      e: for (let r = this.index, s = this.stack.length; s >= 0; ) {
        for (let o = e; o; o = o._parent)
          if (o.index == r) {
            if (r == this.index)
              return o;
            t = o, i = s + 1;
            break e;
          }
        r = this.stack[--s];
      }
    for (let r = i; r < this.stack.length; r++)
      t = new ot(this.buffer, t, this.stack[r]);
    return this.bufferNode = new ot(this.buffer, t, this.index);
  }
  /**
  Get the [tree](#common.Tree) that represents the current node, if
  any. Will return null when the node is in a [tree
  buffer](#common.TreeBuffer).
  */
  get tree() {
    return this.buffer ? null : this._tree._tree;
  }
  /**
  Iterate over the current node and all its descendants, calling
  `enter` when entering a node and `leave`, if given, when leaving
  one. When `enter` returns `false`, any children of that node are
  skipped, and `leave` isn't called for it.
  */
  iterate(e, t) {
    for (let i = 0; ; ) {
      let r = !1;
      if (this.type.isAnonymous || e(this) !== !1) {
        if (this.firstChild()) {
          i++;
          continue;
        }
        this.type.isAnonymous || (r = !0);
      }
      for (; ; ) {
        if (r && t && t(this), r = this.type.isAnonymous, !i)
          return;
        if (this.nextSibling())
          break;
        this.parent(), i--, r = !0;
      }
    }
  }
  /**
  Test whether the current node matches a given context—a sequence
  of direct parent node names. Empty strings in the context array
  are treated as wildcards.
  */
  matchContext(e) {
    if (!this.buffer)
      return Go(this.node.parent, e);
    let { buffer: t } = this.buffer, { types: i } = t.set;
    for (let r = e.length - 1, s = this.stack.length - 1; r >= 0; s--) {
      if (s < 0)
        return Go(this._tree, e, r);
      let o = i[t.buffer[this.stack[s]]];
      if (!o.isAnonymous) {
        if (e[r] && e[r] != o.name)
          return !1;
        r--;
      }
    }
    return !0;
  }
}
function Al(n) {
  return n.children.some((e) => e instanceof _t || !e.type.isAnonymous || Al(e));
}
function f0(n) {
  var e;
  let { buffer: t, nodeSet: i, maxBufferLength: r = xf, reused: s = [], minRepeatType: o = i.types.length } = n, l = Array.isArray(t) ? new Rl(t, t.length) : t, a = i.types, h = 0, O = 0;
  function c(k, x, P, j, E, G) {
    let { id: M, start: R, end: B, size: U } = l, F = O, Se = h;
    if (U < 0)
      if (l.next(), U == -1) {
        let ft = s[M];
        P.push(ft), j.push(R - k);
        return;
      } else if (U == -3) {
        h = M;
        return;
      } else if (U == -4) {
        O = M;
        return;
      } else
        throw new RangeError(`Unrecognized record size: ${U}`);
    let ve = a[M], Fe, Oe, ze = R - k;
    if (B - R <= r && (Oe = g(l.pos - x, E))) {
      let ft = new Uint16Array(Oe.size - Oe.skip), Me = l.pos - Oe.size, He = ft.length;
      for (; l.pos > Me; )
        He = Q(Oe.start, ft, He);
      Fe = new _t(ft, B - Oe.start, i), ze = Oe.start - k;
    } else {
      let ft = l.pos - U;
      l.next();
      let Me = [], He = [], Nt = M >= o ? M : -1, ui = 0, Mn = B;
      for (; l.pos > ft; )
        Nt >= 0 && l.id == Nt && l.size >= 0 ? (l.end <= Mn - r && (d(Me, He, R, ui, l.end, Mn, Nt, F, Se), ui = Me.length, Mn = l.end), l.next()) : G > 2500 ? f(R, ft, Me, He) : c(R, ft, Me, He, Nt, G + 1);
      if (Nt >= 0 && ui > 0 && ui < Me.length && d(Me, He, R, ui, R, Mn, Nt, F, Se), Me.reverse(), He.reverse(), Nt > -1 && ui > 0) {
        let ga = u(ve, Se);
        Fe = ql(ve, Me, He, 0, Me.length, 0, B - R, ga, ga);
      } else
        Fe = p(ve, Me, He, B - R, F - B, Se);
    }
    P.push(Fe), j.push(ze);
  }
  function f(k, x, P, j) {
    let E = [], G = 0, M = -1;
    for (; l.pos > x; ) {
      let { id: R, start: B, end: U, size: F } = l;
      if (F > 4)
        l.next();
      else {
        if (M > -1 && B < M)
          break;
        M < 0 && (M = U - r), E.push(R, B, U), G++, l.next();
      }
    }
    if (G) {
      let R = new Uint16Array(G * 4), B = E[E.length - 2];
      for (let U = E.length - 3, F = 0; U >= 0; U -= 3)
        R[F++] = E[U], R[F++] = E[U + 1] - B, R[F++] = E[U + 2] - B, R[F++] = F;
      P.push(new _t(R, E[2] - B, i)), j.push(B - k);
    }
  }
  function u(k, x) {
    return (P, j, E) => {
      let G = 0, M = P.length - 1, R, B;
      if (M >= 0 && (R = P[M]) instanceof z) {
        if (!M && R.type == k && R.length == E)
          return R;
        (B = R.prop(q.lookAhead)) && (G = j[M] + R.length + B);
      }
      return p(k, P, j, E, G, x);
    };
  }
  function d(k, x, P, j, E, G, M, R, B) {
    let U = [], F = [];
    for (; k.length > j; )
      U.push(k.pop()), F.push(x.pop() + P - E);
    k.push(p(i.types[M], U, F, G - E, R - G, B)), x.push(E - P);
  }
  function p(k, x, P, j, E, G, M) {
    if (G) {
      let R = [q.contextHash, G];
      M = M ? [R].concat(M) : [R];
    }
    if (E > 25) {
      let R = [q.lookAhead, E];
      M = M ? [R].concat(M) : [R];
    }
    return new z(k, x, P, j, M);
  }
  function g(k, x) {
    let P = l.fork(), j = 0, E = 0, G = 0, M = P.end - r, R = { size: 0, start: 0, skip: 0 };
    e: for (let B = P.pos - k; P.pos > B; ) {
      let U = P.size;
      if (P.id == x && U >= 0) {
        R.size = j, R.start = E, R.skip = G, G += 4, j += 4, P.next();
        continue;
      }
      let F = P.pos - U;
      if (U < 0 || F < B || P.start < M)
        break;
      let Se = P.id >= o ? 4 : 0, ve = P.start;
      for (P.next(); P.pos > F; ) {
        if (P.size < 0)
          if (P.size == -3 || P.size == -4)
            Se += 4;
          else
            break e;
        else P.id >= o && (Se += 4);
        P.next();
      }
      E = ve, j += U, G += Se;
    }
    return (x < 0 || j == k) && (R.size = j, R.start = E, R.skip = G), R.size > 4 ? R : void 0;
  }
  function Q(k, x, P) {
    let { id: j, start: E, end: G, size: M } = l;
    if (l.next(), M >= 0 && j < o) {
      let R = P;
      if (M > 4) {
        let B = l.pos - (M - 4);
        for (; l.pos > B; )
          P = Q(k, x, P);
      }
      x[--P] = R, x[--P] = G - k, x[--P] = E - k, x[--P] = j;
    } else M == -3 ? h = j : M == -4 && (O = j);
    return P;
  }
  let b = [], y = [];
  for (; l.pos > 0; )
    c(n.start || 0, n.bufferStart || 0, b, y, -1, 0);
  let C = (e = n.length) !== null && e !== void 0 ? e : b.length ? y[0] + b[0].length : 0;
  return new z(a[n.topID], b.reverse(), y.reverse(), C);
}
const Qh = /* @__PURE__ */ new WeakMap();
function pr(n, e) {
  if (!n.isAnonymous || e instanceof _t || e.type != n)
    return 1;
  let t = Qh.get(e);
  if (t == null) {
    t = 1;
    for (let i of e.children) {
      if (i.type != n || !(i instanceof z)) {
        t = 1;
        break;
      }
      t += pr(n, i);
    }
    Qh.set(e, t);
  }
  return t;
}
function ql(n, e, t, i, r, s, o, l, a) {
  let h = 0;
  for (let d = i; d < r; d++)
    h += pr(n, e[d]);
  let O = Math.ceil(
    h * 1.5 / 8
    /* Balance.BranchFactor */
  ), c = [], f = [];
  function u(d, p, g, Q, b) {
    for (let y = g; y < Q; ) {
      let C = y, k = p[y], x = pr(n, d[y]);
      for (y++; y < Q; y++) {
        let P = pr(n, d[y]);
        if (x + P >= O)
          break;
        x += P;
      }
      if (y == C + 1) {
        if (x > O) {
          let P = d[C];
          u(P.children, P.positions, 0, P.children.length, p[C] + b);
          continue;
        }
        c.push(d[C]);
      } else {
        let P = p[y - 1] + d[y - 1].length - k;
        c.push(ql(n, d, p, C, y, k, P, null, a));
      }
      f.push(k + b - s);
    }
  }
  return u(e, t, i, r, 0), (l || a)(c, f, o);
}
class jl {
  constructor() {
    this.map = /* @__PURE__ */ new WeakMap();
  }
  setBuffer(e, t, i) {
    let r = this.map.get(e);
    r || this.map.set(e, r = /* @__PURE__ */ new Map()), r.set(t, i);
  }
  getBuffer(e, t) {
    let i = this.map.get(e);
    return i && i.get(t);
  }
  /**
  Set the value for this syntax node.
  */
  set(e, t) {
    e instanceof ot ? this.setBuffer(e.context.buffer, e.index, t) : e instanceof ge && this.map.set(e.tree, t);
  }
  /**
  Retrieve value for this syntax node, if it exists in the map.
  */
  get(e) {
    return e instanceof ot ? this.getBuffer(e.context.buffer, e.index) : e instanceof ge ? this.map.get(e.tree) : void 0;
  }
  /**
  Set the value for the node that a cursor currently points to.
  */
  cursorSet(e, t) {
    e.buffer ? this.setBuffer(e.buffer.buffer, e.index, t) : this.map.set(e.tree, t);
  }
  /**
  Retrieve the value for the node that a cursor currently points
  to.
  */
  cursorGet(e) {
    return e.buffer ? this.getBuffer(e.buffer.buffer, e.index) : this.map.get(e.tree);
  }
}
class yt {
  /**
  Construct a tree fragment. You'll usually want to use
  [`addTree`](#common.TreeFragment^addTree) and
  [`applyChanges`](#common.TreeFragment^applyChanges) instead of
  calling this directly.
  */
  constructor(e, t, i, r, s = !1, o = !1) {
    this.from = e, this.to = t, this.tree = i, this.offset = r, this.open = (s ? 1 : 0) | (o ? 2 : 0);
  }
  /**
  Whether the start of the fragment represents the start of a
  parse, or the end of a change. (In the second case, it may not
  be safe to reuse some nodes at the start, depending on the
  parsing algorithm.)
  */
  get openStart() {
    return (this.open & 1) > 0;
  }
  /**
  Whether the end of the fragment represents the end of a
  full-document parse, or the start of a change.
  */
  get openEnd() {
    return (this.open & 2) > 0;
  }
  /**
  Create a set of fragments from a freshly parsed tree, or update
  an existing set of fragments by replacing the ones that overlap
  with a tree with content from the new tree. When `partial` is
  true, the parse is treated as incomplete, and the resulting
  fragment has [`openEnd`](#common.TreeFragment.openEnd) set to
  true.
  */
  static addTree(e, t = [], i = !1) {
    let r = [new yt(0, e.length, e, 0, !1, i)];
    for (let s of t)
      s.to > e.length && r.push(s);
    return r;
  }
  /**
  Apply a set of edits to an array of fragments, removing or
  splitting fragments as necessary to remove edited ranges, and
  adjusting offsets for fragments that moved.
  */
  static applyChanges(e, t, i = 128) {
    if (!t.length)
      return e;
    let r = [], s = 1, o = e.length ? e[0] : null;
    for (let l = 0, a = 0, h = 0; ; l++) {
      let O = l < t.length ? t[l] : null, c = O ? O.fromA : 1e9;
      if (c - a >= i)
        for (; o && o.from < c; ) {
          let f = o;
          if (a >= f.from || c <= f.to || h) {
            let u = Math.max(f.from, a) - h, d = Math.min(f.to, c) - h;
            f = u >= d ? null : new yt(u, d, f.tree, f.offset + h, l > 0, !!O);
          }
          if (f && r.push(f), o.to > c)
            break;
          o = s < e.length ? e[s++] : null;
        }
      if (!O)
        break;
      a = O.toA, h = O.toA - O.toB;
    }
    return r;
  }
}
class as {
  /**
  Start a parse, returning a [partial parse](#common.PartialParse)
  object. [`fragments`](#common.TreeFragment) can be passed in to
  make the parse incremental.
  
  By default, the entire input is parsed. You can pass `ranges`,
  which should be a sorted array of non-empty, non-overlapping
  ranges, to parse only those ranges. The tree returned in that
  case will start at `ranges[0].from`.
  */
  startParse(e, t, i) {
    return typeof e == "string" && (e = new u0(e)), i = i ? i.length ? i.map((r) => new Ee(r.from, r.to)) : [new Ee(0, 0)] : [new Ee(0, e.length)], this.createParse(e, t || [], i);
  }
  /**
  Run a full parse, returning the resulting tree.
  */
  parse(e, t, i) {
    let r = this.startParse(e, t, i);
    for (; ; ) {
      let s = r.advance();
      if (s)
        return s;
    }
  }
}
class u0 {
  constructor(e) {
    this.string = e;
  }
  get length() {
    return this.string.length;
  }
  chunk(e) {
    return this.string.slice(e);
  }
  get lineChunks() {
    return !1;
  }
  read(e, t) {
    return this.string.slice(e, t);
  }
}
function Tf(n) {
  return (e, t, i, r) => new p0(e, n, t, i, r);
}
class Sh {
  constructor(e, t, i, r, s, o) {
    this.parser = e, this.parse = t, this.overlay = i, this.bracketed = r, this.target = s, this.from = o;
  }
}
function bh(n) {
  if (!n.length || n.some((e) => e.from >= e.to))
    throw new RangeError("Invalid inner parse ranges given: " + JSON.stringify(n));
}
class d0 {
  constructor(e, t, i, r, s, o, l, a) {
    this.parser = e, this.predicate = t, this.mounts = i, this.index = r, this.start = s, this.bracketed = o, this.target = l, this.prev = a, this.depth = 0, this.ranges = [];
  }
}
const No = new q({ perNode: !0 });
class p0 {
  constructor(e, t, i, r, s) {
    this.nest = t, this.input = i, this.fragments = r, this.ranges = s, this.inner = [], this.innerDone = 0, this.baseTree = null, this.stoppedAt = null, this.baseParse = e;
  }
  advance() {
    if (this.baseParse) {
      let i = this.baseParse.advance();
      if (!i)
        return null;
      if (this.baseParse = null, this.baseTree = i, this.startInner(), this.stoppedAt != null)
        for (let r of this.inner)
          r.parse.stopAt(this.stoppedAt);
    }
    if (this.innerDone == this.inner.length) {
      let i = this.baseTree;
      return this.stoppedAt != null && (i = new z(i.type, i.children, i.positions, i.length, i.propValues.concat([[No, this.stoppedAt]]))), i;
    }
    let e = this.inner[this.innerDone], t = e.parse.advance();
    if (t) {
      this.innerDone++;
      let i = Object.assign(/* @__PURE__ */ Object.create(null), e.target.props);
      i[q.mounted.id] = new Pi(t, e.overlay, e.parser, e.bracketed), e.target.props = i;
    }
    return null;
  }
  get parsedPos() {
    if (this.baseParse)
      return 0;
    let e = this.input.length;
    for (let t = this.innerDone; t < this.inner.length; t++)
      this.inner[t].from < e && (e = Math.min(e, this.inner[t].parse.parsedPos));
    return e;
  }
  stopAt(e) {
    if (this.stoppedAt = e, this.baseParse)
      this.baseParse.stopAt(e);
    else
      for (let t = this.innerDone; t < this.inner.length; t++)
        this.inner[t].parse.stopAt(e);
  }
  startInner() {
    let e = new Q0(this.fragments), t = null, i = null, r = new Ar(new ge(this.baseTree, this.ranges[0].from, 0, null), V.IncludeAnonymous | V.IgnoreMounts);
    e: for (let s, o; ; ) {
      let l = !0, a;
      if (this.stoppedAt != null && r.from >= this.stoppedAt)
        l = !1;
      else if (e.hasNode(r)) {
        if (t) {
          let h = t.mounts.find((O) => O.frag.from <= r.from && O.frag.to >= r.to && O.mount.overlay);
          if (h)
            for (let O of h.mount.overlay) {
              let c = O.from + h.pos, f = O.to + h.pos;
              c >= r.from && f <= r.to && !t.ranges.some((u) => u.from < f && u.to > c) && t.ranges.push({ from: c, to: f });
            }
        }
        l = !1;
      } else if (i && (o = m0(i.ranges, r.from, r.to)))
        l = o != 2;
      else if (!r.type.isAnonymous && (s = this.nest(r, this.input)) && (r.from < r.to || !s.overlay)) {
        r.tree || (g0(r), t && t.depth++, i && i.depth++);
        let h = e.findMounts(r.from, s.parser);
        if (typeof s.overlay == "function")
          t = new d0(s.parser, s.overlay, h, this.inner.length, r.from, !!s.bracketed, r.tree, t);
        else {
          let O = $h(this.ranges, s.overlay || (r.from < r.to ? [new Ee(r.from, r.to)] : []));
          O.length && bh(O), (O.length || !s.overlay) && this.inner.push(new Sh(s.parser, O.length ? s.parser.startParse(this.input, xh(h, O), O) : s.parser.startParse(""), s.overlay ? s.overlay.map((c) => new Ee(c.from - r.from, c.to - r.from)) : null, !!s.bracketed, r.tree, O.length ? O[0].from : r.from)), s.overlay ? O.length && (i = { ranges: O, depth: 0, prev: i }) : l = !1;
        }
      } else if (t && (a = t.predicate(r)) && (a === !0 && (a = new Ee(r.from, r.to)), a.from < a.to)) {
        let h = t.ranges.length - 1;
        h >= 0 && t.ranges[h].to == a.from ? t.ranges[h] = { from: t.ranges[h].from, to: a.to } : t.ranges.push(a);
      }
      if (l && r.firstChild())
        t && t.depth++, i && i.depth++;
      else
        for (; !r.nextSibling(); ) {
          if (!r.parent())
            break e;
          if (t && !--t.depth) {
            let h = $h(this.ranges, t.ranges);
            h.length && (bh(h), this.inner.splice(t.index, 0, new Sh(t.parser, t.parser.startParse(this.input, xh(t.mounts, h), h), t.ranges.map((O) => new Ee(O.from - t.start, O.to - t.start)), t.bracketed, t.target, h[0].from))), t = t.prev;
          }
          i && !--i.depth && (i = i.prev);
        }
    }
  }
}
function m0(n, e, t) {
  for (let i of n) {
    if (i.from >= t)
      break;
    if (i.to > e)
      return i.from <= e && i.to >= t ? 2 : 1;
  }
  return 0;
}
function yh(n, e, t, i, r, s) {
  if (e < t) {
    let o = n.buffer[e + 1];
    i.push(n.slice(e, t, o)), r.push(o - s);
  }
}
function g0(n) {
  let { node: e } = n, t = [], i = e.context.buffer;
  do
    t.push(n.index), n.parent();
  while (!n.tree);
  let r = n.tree, s = r.children.indexOf(i), o = r.children[s], l = o.buffer, a = [s];
  function h(O, c, f, u, d, p) {
    let g = t[p], Q = [], b = [];
    yh(o, O, g, Q, b, u);
    let y = l[g + 1], C = l[g + 2];
    a.push(Q.length);
    let k = p ? h(g + 4, l[g + 3], o.set.types[l[g]], y, C - y, p - 1) : e.toTree();
    return Q.push(k), b.push(y - u), yh(o, l[g + 3], c, Q, b, u), new z(f, Q, b, d);
  }
  r.children[s] = h(0, l.length, se.none, 0, o.length, t.length - 1);
  for (let O of a) {
    let c = n.tree.children[O], f = n.tree.positions[O];
    n.yield(new ge(c, f + n.from, O, n._tree));
  }
}
class kh {
  constructor(e, t) {
    this.offset = t, this.done = !1, this.cursor = e.cursor(V.IncludeAnonymous | V.IgnoreMounts | V.ExcludeBuffers);
  }
  // Move to the first node (in pre-order) that starts at or after `pos`.
  moveTo(e) {
    let { cursor: t } = this, i = e - this.offset;
    for (; !this.done && t.from < i; )
      if (!(t.to >= i && t.enter(i, 1, V.IncludeAnonymous | V.IgnoreOverlays | V.ExcludeBuffers))) if (t.to <= i)
        t.next(!1) || (this.done = !0);
      else
        break;
  }
  hasNode(e) {
    if (this.moveTo(e.from), !this.done && this.cursor.from + this.offset == e.from && this.cursor.tree)
      for (let t = this.cursor.tree; ; ) {
        if (t == e.tree)
          return !0;
        if (t.children.length && t.positions[0] == 0 && t.children[0] instanceof z)
          t = t.children[0];
        else
          break;
      }
    return !1;
  }
}
let Q0 = class {
  constructor(e) {
    var t;
    if (this.fragments = e, this.curTo = 0, this.fragI = 0, e.length) {
      let i = this.curFrag = e[0];
      this.curTo = (t = i.tree.prop(No)) !== null && t !== void 0 ? t : i.to, this.inner = new kh(i.tree, -i.offset);
    } else
      this.curFrag = this.inner = null;
  }
  hasNode(e) {
    for (; this.curFrag && e.from >= this.curTo; )
      this.nextFrag();
    return this.curFrag && this.curFrag.from <= e.from && this.curTo >= e.to && this.inner.hasNode(e);
  }
  nextFrag() {
    var e;
    if (this.fragI++, this.fragI == this.fragments.length)
      this.curFrag = this.inner = null;
    else {
      let t = this.curFrag = this.fragments[this.fragI];
      this.curTo = (e = t.tree.prop(No)) !== null && e !== void 0 ? e : t.to, this.inner = new kh(t.tree, -t.offset);
    }
  }
  findMounts(e, t) {
    var i;
    let r = [];
    if (this.inner) {
      this.inner.cursor.moveTo(e, 1);
      for (let s = this.inner.cursor.node; s; s = s.parent) {
        let o = (i = s.tree) === null || i === void 0 ? void 0 : i.prop(q.mounted);
        if (o && o.parser == t)
          for (let l = this.fragI; l < this.fragments.length; l++) {
            let a = this.fragments[l];
            if (a.from >= s.to)
              break;
            a.tree == this.curFrag.tree && r.push({
              frag: a,
              pos: s.from - a.offset,
              mount: o
            });
          }
      }
    }
    return r;
  }
};
function $h(n, e) {
  let t = null, i = e;
  for (let r = 1, s = 0; r < n.length; r++) {
    let o = n[r - 1].to, l = n[r].from;
    for (; s < i.length; s++) {
      let a = i[s];
      if (a.from >= l)
        break;
      a.to <= o || (t || (i = t = e.slice()), a.from < o ? (t[s] = new Ee(a.from, o), a.to > l && t.splice(s + 1, 0, new Ee(l, a.to))) : a.to > l ? t[s--] = new Ee(l, a.to) : t.splice(s--, 1));
    }
  }
  return i;
}
function S0(n, e, t, i) {
  let r = 0, s = 0, o = !1, l = !1, a = -1e9, h = [];
  for (; ; ) {
    let O = r == n.length ? 1e9 : o ? n[r].to : n[r].from, c = s == e.length ? 1e9 : l ? e[s].to : e[s].from;
    if (o != l) {
      let f = Math.max(a, t), u = Math.min(O, c, i);
      f < u && h.push(new Ee(f, u));
    }
    if (a = Math.min(O, c), a == 1e9)
      break;
    O == a && (o ? (o = !1, r++) : o = !0), c == a && (l ? (l = !1, s++) : l = !0);
  }
  return h;
}
function xh(n, e) {
  let t = [];
  for (let { pos: i, mount: r, frag: s } of n) {
    let o = i + (r.overlay ? r.overlay[0].from : 0), l = o + r.tree.length, a = Math.max(s.from, o), h = Math.min(s.to, l);
    if (r.overlay) {
      let O = r.overlay.map((f) => new Ee(f.from + i, f.to + i)), c = S0(e, O, a, h);
      for (let f = 0, u = a; ; f++) {
        let d = f == c.length, p = d ? h : c[f].from;
        if (p > u && t.push(new yt(u, p, r.tree, -o, s.from >= u || s.openStart, s.to <= p || s.openEnd)), d)
          break;
        u = c[f].to;
      }
    } else
      t.push(new yt(a, h, r.tree, -o, s.from >= o || s.openStart, s.to <= l || s.openEnd));
  }
  return t;
}
let b0 = 0;
class qe {
  /**
  @internal
  */
  constructor(e, t, i, r) {
    this.name = e, this.set = t, this.base = i, this.modified = r, this.id = b0++;
  }
  toString() {
    let { name: e } = this;
    for (let t of this.modified)
      t.name && (e = `${t.name}(${e})`);
    return e;
  }
  static define(e, t) {
    let i = typeof e == "string" ? e : "?";
    if (e instanceof qe && (t = e), t?.base)
      throw new Error("Can not derive from a modified tag");
    let r = new qe(i, [], null, []);
    if (r.set.push(r), t)
      for (let s of t.set)
        r.set.push(s);
    return r;
  }
  /**
  Define a tag _modifier_, which is a function that, given a tag,
  will return a tag that is a subtag of the original. Applying the
  same modifier to a twice tag will return the same value (`m1(t1)
  == m1(t1)`) and applying multiple modifiers will, regardless or
  order, produce the same tag (`m1(m2(t1)) == m2(m1(t1))`).
  
  When multiple modifiers are applied to a given base tag, each
  smaller set of modifiers is registered as a parent, so that for
  example `m1(m2(m3(t1)))` is a subtype of `m1(m2(t1))`,
  `m1(m3(t1)`, and so on.
  */
  static defineModifier(e) {
    let t = new qr(e);
    return (i) => i.modified.indexOf(t) > -1 ? i : qr.get(i.base || i, i.modified.concat(t).sort((r, s) => r.id - s.id));
  }
}
let y0 = 0;
class qr {
  constructor(e) {
    this.name = e, this.instances = [], this.id = y0++;
  }
  static get(e, t) {
    if (!t.length)
      return e;
    let i = t[0].instances.find((l) => l.base == e && k0(t, l.modified));
    if (i)
      return i;
    let r = [], s = new qe(e.name, r, e, t);
    for (let l of t)
      l.instances.push(s);
    let o = $0(t);
    for (let l of e.set)
      if (!l.modified.length)
        for (let a of o)
          r.push(qr.get(l, a));
    return s;
  }
}
function k0(n, e) {
  return n.length == e.length && n.every((t, i) => t == e[i]);
}
function $0(n) {
  let e = [[]];
  for (let t = 0; t < n.length; t++)
    for (let i = 0, r = e.length; i < r; i++)
      e.push(e[i].concat(n[t]));
  return e.sort((t, i) => i.length - t.length);
}
function Dt(n) {
  let e = /* @__PURE__ */ Object.create(null);
  for (let t in n) {
    let i = n[t];
    Array.isArray(i) || (i = [i]);
    for (let r of t.split(" "))
      if (r) {
        let s = [], o = 2, l = r;
        for (let c = 0; ; ) {
          if (l == "..." && c > 0 && c + 3 == r.length) {
            o = 1;
            break;
          }
          let f = /^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(l);
          if (!f)
            throw new RangeError("Invalid path: " + r);
          if (s.push(f[0] == "*" ? "" : f[0][0] == '"' ? JSON.parse(f[0]) : f[0]), c += f[0].length, c == r.length)
            break;
          let u = r[c++];
          if (c == r.length && u == "!") {
            o = 0;
            break;
          }
          if (u != "/")
            throw new RangeError("Invalid path: " + r);
          l = r.slice(c);
        }
        let a = s.length - 1, h = s[a];
        if (!h)
          throw new RangeError("Invalid path: " + r);
        let O = new Sn(i, o, a > 0 ? s.slice(0, a) : null);
        e[h] = O.sort(e[h]);
      }
  }
  return Xf.add(e);
}
const Xf = new q({
  combine(n, e) {
    let t, i, r;
    for (; n || e; ) {
      if (!n || e && n.depth <= e.depth ? (r = e, e = e.next) : (r = n, n = n.next), t && t.mode == r.mode && !r.context && !t.context)
        continue;
      let s = new Sn(r.tags, r.mode, r.context);
      t ? t.next = s : i = s, t = s;
    }
    return i;
  }
});
class Sn {
  constructor(e, t, i, r) {
    this.tags = e, this.mode = t, this.context = i, this.next = r;
  }
  get opaque() {
    return this.mode == 0;
  }
  get inherit() {
    return this.mode == 1;
  }
  sort(e) {
    return !e || e.depth < this.depth ? (this.next = e, this) : (e.next = this.sort(e.next), e);
  }
  get depth() {
    return this.context ? this.context.length : 0;
  }
}
Sn.empty = new Sn([], 2, null);
function Cf(n, e) {
  let t = /* @__PURE__ */ Object.create(null);
  for (let s of n)
    if (!Array.isArray(s.tag))
      t[s.tag.id] = s.class;
    else
      for (let o of s.tag)
        t[o.id] = s.class;
  let { scope: i, all: r = null } = e || {};
  return {
    style: (s) => {
      let o = r;
      for (let l of s)
        for (let a of l.set) {
          let h = t[a.id];
          if (h) {
            o = o ? o + " " + h : h;
            break;
          }
        }
      return o;
    },
    scope: i
  };
}
function x0(n, e) {
  let t = null;
  for (let i of n) {
    let r = i.style(e);
    r && (t = t ? t + " " + r : r);
  }
  return t;
}
function P0(n, e, t, i = 0, r = n.length) {
  let s = new w0(i, Array.isArray(e) ? e : [e], t);
  s.highlightRange(n.cursor(), i, r, "", s.highlighters), s.flush(r);
}
class w0 {
  constructor(e, t, i) {
    this.at = e, this.highlighters = t, this.span = i, this.class = "";
  }
  startSpan(e, t) {
    t != this.class && (this.flush(e), e > this.at && (this.at = e), this.class = t);
  }
  flush(e) {
    e > this.at && this.class && this.span(this.at, e, this.class);
  }
  highlightRange(e, t, i, r, s) {
    let { type: o, from: l, to: a } = e;
    if (l >= i || a <= t)
      return;
    o.isTop && (s = this.highlighters.filter((u) => !u.scope || u.scope(o)));
    let h = r, O = v0(e) || Sn.empty, c = x0(s, O.tags);
    if (c && (h && (h += " "), h += c, O.mode == 1 && (r += (r ? " " : "") + c)), this.startSpan(Math.max(t, l), h), O.opaque)
      return;
    let f = e.tree && e.tree.prop(q.mounted);
    if (f && f.overlay) {
      let u = e.node.enter(f.overlay[0].from + l, 1), d = this.highlighters.filter((g) => !g.scope || g.scope(f.tree.type)), p = e.firstChild();
      for (let g = 0, Q = l; ; g++) {
        let b = g < f.overlay.length ? f.overlay[g] : null, y = b ? b.from + l : a, C = Math.max(t, Q), k = Math.min(i, y);
        if (C < k && p)
          for (; e.from < k && (this.highlightRange(e, C, k, r, s), this.startSpan(Math.min(k, e.to), h), !(e.to >= y || !e.nextSibling())); )
            ;
        if (!b || y > i)
          break;
        Q = b.to + l, Q > t && (this.highlightRange(u.cursor(), Math.max(t, b.from + l), Math.min(i, Q), "", d), this.startSpan(Math.min(i, Q), h));
      }
      p && e.parent();
    } else if (e.firstChild()) {
      f && (r = "");
      do
        if (!(e.to <= t)) {
          if (e.from >= i)
            break;
          this.highlightRange(e, t, i, r, s), this.startSpan(Math.min(i, e.to), h);
        }
      while (e.nextSibling());
      e.parent();
    }
  }
}
function v0(n) {
  let e = n.type.prop(Xf);
  for (; e && e.context && !n.matchContext(e.context); )
    e = e.next;
  return e || null;
}
const w = qe.define, Jn = w(), vt = w(), Ph = w(vt), wh = w(vt), Tt = w(), er = w(Tt), js = w(Tt), tt = w(), Ft = w(tt), Je = w(), et = w(), Fo = w(), Di = w(Fo), tr = w(), m = {
  /**
  A comment.
  */
  comment: Jn,
  /**
  A line [comment](#highlight.tags.comment).
  */
  lineComment: w(Jn),
  /**
  A block [comment](#highlight.tags.comment).
  */
  blockComment: w(Jn),
  /**
  A documentation [comment](#highlight.tags.comment).
  */
  docComment: w(Jn),
  /**
  Any kind of identifier.
  */
  name: vt,
  /**
  The [name](#highlight.tags.name) of a variable.
  */
  variableName: w(vt),
  /**
  A type [name](#highlight.tags.name).
  */
  typeName: Ph,
  /**
  A tag name (subtag of [`typeName`](#highlight.tags.typeName)).
  */
  tagName: w(Ph),
  /**
  A property or field [name](#highlight.tags.name).
  */
  propertyName: wh,
  /**
  An attribute name (subtag of [`propertyName`](#highlight.tags.propertyName)).
  */
  attributeName: w(wh),
  /**
  The [name](#highlight.tags.name) of a class.
  */
  className: w(vt),
  /**
  A label [name](#highlight.tags.name).
  */
  labelName: w(vt),
  /**
  A namespace [name](#highlight.tags.name).
  */
  namespace: w(vt),
  /**
  The [name](#highlight.tags.name) of a macro.
  */
  macroName: w(vt),
  /**
  A literal value.
  */
  literal: Tt,
  /**
  A string [literal](#highlight.tags.literal).
  */
  string: er,
  /**
  A documentation [string](#highlight.tags.string).
  */
  docString: w(er),
  /**
  A character literal (subtag of [string](#highlight.tags.string)).
  */
  character: w(er),
  /**
  An attribute value (subtag of [string](#highlight.tags.string)).
  */
  attributeValue: w(er),
  /**
  A number [literal](#highlight.tags.literal).
  */
  number: js,
  /**
  An integer [number](#highlight.tags.number) literal.
  */
  integer: w(js),
  /**
  A floating-point [number](#highlight.tags.number) literal.
  */
  float: w(js),
  /**
  A boolean [literal](#highlight.tags.literal).
  */
  bool: w(Tt),
  /**
  Regular expression [literal](#highlight.tags.literal).
  */
  regexp: w(Tt),
  /**
  An escape [literal](#highlight.tags.literal), for example a
  backslash escape in a string.
  */
  escape: w(Tt),
  /**
  A color [literal](#highlight.tags.literal).
  */
  color: w(Tt),
  /**
  A URL [literal](#highlight.tags.literal).
  */
  url: w(Tt),
  /**
  A language keyword.
  */
  keyword: Je,
  /**
  The [keyword](#highlight.tags.keyword) for the self or this
  object.
  */
  self: w(Je),
  /**
  The [keyword](#highlight.tags.keyword) for null.
  */
  null: w(Je),
  /**
  A [keyword](#highlight.tags.keyword) denoting some atomic value.
  */
  atom: w(Je),
  /**
  A [keyword](#highlight.tags.keyword) that represents a unit.
  */
  unit: w(Je),
  /**
  A modifier [keyword](#highlight.tags.keyword).
  */
  modifier: w(Je),
  /**
  A [keyword](#highlight.tags.keyword) that acts as an operator.
  */
  operatorKeyword: w(Je),
  /**
  A control-flow related [keyword](#highlight.tags.keyword).
  */
  controlKeyword: w(Je),
  /**
  A [keyword](#highlight.tags.keyword) that defines something.
  */
  definitionKeyword: w(Je),
  /**
  A [keyword](#highlight.tags.keyword) related to defining or
  interfacing with modules.
  */
  moduleKeyword: w(Je),
  /**
  An operator.
  */
  operator: et,
  /**
  An [operator](#highlight.tags.operator) that dereferences something.
  */
  derefOperator: w(et),
  /**
  Arithmetic-related [operator](#highlight.tags.operator).
  */
  arithmeticOperator: w(et),
  /**
  Logical [operator](#highlight.tags.operator).
  */
  logicOperator: w(et),
  /**
  Bit [operator](#highlight.tags.operator).
  */
  bitwiseOperator: w(et),
  /**
  Comparison [operator](#highlight.tags.operator).
  */
  compareOperator: w(et),
  /**
  [Operator](#highlight.tags.operator) that updates its operand.
  */
  updateOperator: w(et),
  /**
  [Operator](#highlight.tags.operator) that defines something.
  */
  definitionOperator: w(et),
  /**
  Type-related [operator](#highlight.tags.operator).
  */
  typeOperator: w(et),
  /**
  Control-flow [operator](#highlight.tags.operator).
  */
  controlOperator: w(et),
  /**
  Program or markup punctuation.
  */
  punctuation: Fo,
  /**
  [Punctuation](#highlight.tags.punctuation) that separates
  things.
  */
  separator: w(Fo),
  /**
  Bracket-style [punctuation](#highlight.tags.punctuation).
  */
  bracket: Di,
  /**
  Angle [brackets](#highlight.tags.bracket) (usually `<` and `>`
  tokens).
  */
  angleBracket: w(Di),
  /**
  Square [brackets](#highlight.tags.bracket) (usually `[` and `]`
  tokens).
  */
  squareBracket: w(Di),
  /**
  Parentheses (usually `(` and `)` tokens). Subtag of
  [bracket](#highlight.tags.bracket).
  */
  paren: w(Di),
  /**
  Braces (usually `{` and `}` tokens). Subtag of
  [bracket](#highlight.tags.bracket).
  */
  brace: w(Di),
  /**
  Content, for example plain text in XML or markup documents.
  */
  content: tt,
  /**
  [Content](#highlight.tags.content) that represents a heading.
  */
  heading: Ft,
  /**
  A level 1 [heading](#highlight.tags.heading).
  */
  heading1: w(Ft),
  /**
  A level 2 [heading](#highlight.tags.heading).
  */
  heading2: w(Ft),
  /**
  A level 3 [heading](#highlight.tags.heading).
  */
  heading3: w(Ft),
  /**
  A level 4 [heading](#highlight.tags.heading).
  */
  heading4: w(Ft),
  /**
  A level 5 [heading](#highlight.tags.heading).
  */
  heading5: w(Ft),
  /**
  A level 6 [heading](#highlight.tags.heading).
  */
  heading6: w(Ft),
  /**
  A prose [content](#highlight.tags.content) separator (such as a horizontal rule).
  */
  contentSeparator: w(tt),
  /**
  [Content](#highlight.tags.content) that represents a list.
  */
  list: w(tt),
  /**
  [Content](#highlight.tags.content) that represents a quote.
  */
  quote: w(tt),
  /**
  [Content](#highlight.tags.content) that is emphasized.
  */
  emphasis: w(tt),
  /**
  [Content](#highlight.tags.content) that is styled strong.
  */
  strong: w(tt),
  /**
  [Content](#highlight.tags.content) that is part of a link.
  */
  link: w(tt),
  /**
  [Content](#highlight.tags.content) that is styled as code or
  monospace.
  */
  monospace: w(tt),
  /**
  [Content](#highlight.tags.content) that has a strike-through
  style.
  */
  strikethrough: w(tt),
  /**
  Inserted text in a change-tracking format.
  */
  inserted: w(),
  /**
  Deleted text.
  */
  deleted: w(),
  /**
  Changed text.
  */
  changed: w(),
  /**
  An invalid or unsyntactic element.
  */
  invalid: w(),
  /**
  Metadata or meta-instruction.
  */
  meta: tr,
  /**
  [Metadata](#highlight.tags.meta) that applies to the entire
  document.
  */
  documentMeta: w(tr),
  /**
  [Metadata](#highlight.tags.meta) that annotates or adds
  attributes to a given syntactic element.
  */
  annotation: w(tr),
  /**
  Processing instruction or preprocessor directive. Subtag of
  [meta](#highlight.tags.meta).
  */
  processingInstruction: w(tr),
  /**
  [Modifier](#highlight.Tag^defineModifier) that indicates that a
  given element is being defined. Expected to be used with the
  various [name](#highlight.tags.name) tags.
  */
  definition: qe.defineModifier("definition"),
  /**
  [Modifier](#highlight.Tag^defineModifier) that indicates that
  something is constant. Mostly expected to be used with
  [variable names](#highlight.tags.variableName).
  */
  constant: qe.defineModifier("constant"),
  /**
  [Modifier](#highlight.Tag^defineModifier) used to indicate that
  a [variable](#highlight.tags.variableName) or [property
  name](#highlight.tags.propertyName) is being called or defined
  as a function.
  */
  function: qe.defineModifier("function"),
  /**
  [Modifier](#highlight.Tag^defineModifier) that can be applied to
  [names](#highlight.tags.name) to indicate that they belong to
  the language's standard environment.
  */
  standard: qe.defineModifier("standard"),
  /**
  [Modifier](#highlight.Tag^defineModifier) that indicates a given
  [names](#highlight.tags.name) is local to some scope.
  */
  local: qe.defineModifier("local"),
  /**
  A generic variant [modifier](#highlight.Tag^defineModifier) that
  can be used to tag language-specific alternative variants of
  some common tag. It is recommended for themes to define special
  forms of at least the [string](#highlight.tags.string) and
  [variable name](#highlight.tags.variableName) tags, since those
  come up a lot.
  */
  special: qe.defineModifier("special")
};
for (let n in m) {
  let e = m[n];
  e instanceof qe && (e.name = n);
}
Cf([
  { tag: m.link, class: "tok-link" },
  { tag: m.heading, class: "tok-heading" },
  { tag: m.emphasis, class: "tok-emphasis" },
  { tag: m.strong, class: "tok-strong" },
  { tag: m.keyword, class: "tok-keyword" },
  { tag: m.atom, class: "tok-atom" },
  { tag: m.bool, class: "tok-bool" },
  { tag: m.url, class: "tok-url" },
  { tag: m.labelName, class: "tok-labelName" },
  { tag: m.inserted, class: "tok-inserted" },
  { tag: m.deleted, class: "tok-deleted" },
  { tag: m.literal, class: "tok-literal" },
  { tag: m.string, class: "tok-string" },
  { tag: m.number, class: "tok-number" },
  { tag: [m.regexp, m.escape, m.special(m.string)], class: "tok-string2" },
  { tag: m.variableName, class: "tok-variableName" },
  { tag: m.local(m.variableName), class: "tok-variableName tok-local" },
  { tag: m.definition(m.variableName), class: "tok-variableName tok-definition" },
  { tag: m.special(m.variableName), class: "tok-variableName2" },
  { tag: m.definition(m.propertyName), class: "tok-propertyName tok-definition" },
  { tag: m.typeName, class: "tok-typeName" },
  { tag: m.namespace, class: "tok-namespace" },
  { tag: m.className, class: "tok-className" },
  { tag: m.macroName, class: "tok-macroName" },
  { tag: m.propertyName, class: "tok-propertyName" },
  { tag: m.operator, class: "tok-operator" },
  { tag: m.comment, class: "tok-comment" },
  { tag: m.meta, class: "tok-meta" },
  { tag: m.invalid, class: "tok-invalid" },
  { tag: m.punctuation, class: "tok-punctuation" }
]);
var Ws;
const Rt = /* @__PURE__ */ new q();
function hs(n) {
  return X.define({
    combine: n ? (e) => e.concat(n) : void 0
  });
}
const Wl = /* @__PURE__ */ new q();
class We {
  /**
  Construct a language object. If you need to invoke this
  directly, first define a data facet with
  [`defineLanguageFacet`](https://codemirror.net/6/docs/ref/#language.defineLanguageFacet), and then
  configure your parser to [attach](https://codemirror.net/6/docs/ref/#language.languageDataProp) it
  to the language's outer syntax node.
  */
  constructor(e, t, i = [], r = "") {
    this.data = e, this.name = r, D.prototype.hasOwnProperty("tree") || Object.defineProperty(D.prototype, "tree", { get() {
      return I(this);
    } }), this.parser = t, this.extension = [
      Lt.of(this),
      D.languageData.of((s, o, l) => {
        let a = vh(s, o, l), h = a.type.prop(Rt);
        if (!h)
          return [];
        let O = s.facet(h), c = a.type.prop(Wl);
        if (c) {
          let f = a.resolve(o - a.from, l);
          for (let u of c)
            if (u.test(f, s)) {
              let d = s.facet(u.facet);
              return u.type == "replace" ? d : d.concat(O);
            }
        }
        return O;
      })
    ].concat(i);
  }
  /**
  Query whether this language is active at the given position.
  */
  isActiveAt(e, t, i = -1) {
    return vh(e, t, i).type.prop(Rt) == this.data;
  }
  /**
  Find the document regions that were parsed using this language.
  The returned regions will _include_ any nested languages rooted
  in this language, when those exist.
  */
  findRegions(e) {
    let t = e.facet(Lt);
    if (t?.data == this.data)
      return [{ from: 0, to: e.doc.length }];
    if (!t || !t.allowsNesting)
      return [];
    let i = [], r = (s, o) => {
      if (s.prop(Rt) == this.data) {
        i.push({ from: o, to: o + s.length });
        return;
      }
      let l = s.prop(q.mounted);
      if (l) {
        if (l.tree.prop(Rt) == this.data) {
          if (l.overlay)
            for (let a of l.overlay)
              i.push({ from: a.from + o, to: a.to + o });
          else
            i.push({ from: o, to: o + s.length });
          return;
        } else if (l.overlay) {
          let a = i.length;
          if (r(l.tree, l.overlay[0].from + o), i.length > a)
            return;
        }
      }
      for (let a = 0; a < s.children.length; a++) {
        let h = s.children[a];
        h instanceof z && r(h, s.positions[a] + o);
      }
    };
    return r(I(e), 0), i;
  }
  /**
  Indicates whether this language allows nested languages. The
  default implementation returns true.
  */
  get allowsNesting() {
    return !0;
  }
}
We.setState = /* @__PURE__ */ W.define();
function vh(n, e, t) {
  let i = n.facet(Lt), r = I(n).topNode;
  if (!i || i.allowsNesting)
    for (let s = r; s; s = s.enter(e, t, V.ExcludeBuffers | V.EnterBracketed))
      s.type.isTop && (r = s);
  return r;
}
class Et extends We {
  constructor(e, t, i) {
    super(e, t, [], i), this.parser = t;
  }
  /**
  Define a language from a parser.
  */
  static define(e) {
    let t = hs(e.languageData);
    return new Et(t, e.parser.configure({
      props: [Rt.add((i) => i.isTop ? t : void 0)]
    }), e.name);
  }
  /**
  Create a new instance of this language with a reconfigured
  version of its parser and optionally a new name.
  */
  configure(e, t) {
    return new Et(this.data, this.parser.configure(e), t || this.name);
  }
  get allowsNesting() {
    return this.parser.hasWrappers();
  }
}
function I(n) {
  let e = n.field(We.state, !1);
  return e ? e.tree : z.empty;
}
class T0 {
  /**
  Create an input object for the given document.
  */
  constructor(e) {
    this.doc = e, this.cursorPos = 0, this.string = "", this.cursor = e.iter();
  }
  get length() {
    return this.doc.length;
  }
  syncTo(e) {
    return this.string = this.cursor.next(e - this.cursorPos).value, this.cursorPos = e + this.string.length, this.cursorPos - this.string.length;
  }
  chunk(e) {
    return this.syncTo(e), this.string;
  }
  get lineChunks() {
    return !0;
  }
  read(e, t) {
    let i = this.cursorPos - this.string.length;
    return e < i || t >= this.cursorPos ? this.doc.sliceString(e, t) : this.string.slice(e - i, t - i);
  }
}
let Bi = null;
class li {
  constructor(e, t, i = [], r, s, o, l, a) {
    this.parser = e, this.state = t, this.fragments = i, this.tree = r, this.treeLen = s, this.viewport = o, this.skipped = l, this.scheduleOn = a, this.parse = null, this.tempSkipped = [];
  }
  /**
  @internal
  */
  static create(e, t, i) {
    return new li(e, t, [], z.empty, 0, i, [], null);
  }
  startParse() {
    return this.parser.startParse(new T0(this.state.doc), this.fragments);
  }
  /**
  @internal
  */
  work(e, t) {
    return t != null && t >= this.state.doc.length && (t = void 0), this.tree != z.empty && this.isDone(t ?? this.state.doc.length) ? (this.takeTree(), !0) : this.withContext(() => {
      var i;
      if (typeof e == "number") {
        let r = Date.now() + e;
        e = () => Date.now() > r;
      }
      for (this.parse || (this.parse = this.startParse()), t != null && (this.parse.stoppedAt == null || this.parse.stoppedAt > t) && t < this.state.doc.length && this.parse.stopAt(t); ; ) {
        let r = this.parse.advance();
        if (r)
          if (this.fragments = this.withoutTempSkipped(yt.addTree(r, this.fragments, this.parse.stoppedAt != null)), this.treeLen = (i = this.parse.stoppedAt) !== null && i !== void 0 ? i : this.state.doc.length, this.tree = r, this.parse = null, this.treeLen < (t ?? this.state.doc.length))
            this.parse = this.startParse();
          else
            return !0;
        if (e())
          return !1;
      }
    });
  }
  /**
  @internal
  */
  takeTree() {
    let e, t;
    this.parse && (e = this.parse.parsedPos) >= this.treeLen && ((this.parse.stoppedAt == null || this.parse.stoppedAt > e) && this.parse.stopAt(e), this.withContext(() => {
      for (; !(t = this.parse.advance()); )
        ;
    }), this.treeLen = e, this.tree = t, this.fragments = this.withoutTempSkipped(yt.addTree(this.tree, this.fragments, !0)), this.parse = null);
  }
  withContext(e) {
    let t = Bi;
    Bi = this;
    try {
      return e();
    } finally {
      Bi = t;
    }
  }
  withoutTempSkipped(e) {
    for (let t; t = this.tempSkipped.pop(); )
      e = Th(e, t.from, t.to);
    return e;
  }
  /**
  @internal
  */
  changes(e, t) {
    let { fragments: i, tree: r, treeLen: s, viewport: o, skipped: l } = this;
    if (this.takeTree(), !e.empty) {
      let a = [];
      if (e.iterChangedRanges((h, O, c, f) => a.push({ fromA: h, toA: O, fromB: c, toB: f })), i = yt.applyChanges(i, a), r = z.empty, s = 0, o = { from: e.mapPos(o.from, -1), to: e.mapPos(o.to, 1) }, this.skipped.length) {
        l = [];
        for (let h of this.skipped) {
          let O = e.mapPos(h.from, 1), c = e.mapPos(h.to, -1);
          O < c && l.push({ from: O, to: c });
        }
      }
    }
    return new li(this.parser, t, i, r, s, o, l, this.scheduleOn);
  }
  /**
  @internal
  */
  updateViewport(e) {
    if (this.viewport.from == e.from && this.viewport.to == e.to)
      return !1;
    this.viewport = e;
    let t = this.skipped.length;
    for (let i = 0; i < this.skipped.length; i++) {
      let { from: r, to: s } = this.skipped[i];
      r < e.to && s > e.from && (this.fragments = Th(this.fragments, r, s), this.skipped.splice(i--, 1));
    }
    return this.skipped.length >= t ? !1 : (this.reset(), !0);
  }
  /**
  @internal
  */
  reset() {
    this.parse && (this.takeTree(), this.parse = null);
  }
  /**
  Notify the parse scheduler that the given region was skipped
  because it wasn't in view, and the parse should be restarted
  when it comes into view.
  */
  skipUntilInView(e, t) {
    this.skipped.push({ from: e, to: t });
  }
  /**
  Returns a parser intended to be used as placeholder when
  asynchronously loading a nested parser. It'll skip its input and
  mark it as not-really-parsed, so that the next update will parse
  it again.
  
  When `until` is given, a reparse will be scheduled when that
  promise resolves.
  */
  static getSkippingParser(e) {
    return new class extends as {
      createParse(t, i, r) {
        let s = r[0].from, o = r[r.length - 1].to;
        return {
          parsedPos: s,
          advance() {
            let a = Bi;
            if (a) {
              for (let h of r)
                a.tempSkipped.push(h);
              e && (a.scheduleOn = a.scheduleOn ? Promise.all([a.scheduleOn, e]) : e);
            }
            return this.parsedPos = o, new z(se.none, [], [], o - s);
          },
          stoppedAt: null,
          stopAt() {
          }
        };
      }
    }();
  }
  /**
  @internal
  */
  isDone(e) {
    e = Math.min(e, this.state.doc.length);
    let t = this.fragments;
    return this.treeLen >= e && t.length && t[0].from == 0 && t[0].to >= e;
  }
  /**
  Get the context for the current parse, or `null` if no editor
  parse is in progress.
  */
  static get() {
    return Bi;
  }
}
function Th(n, e, t) {
  return yt.applyChanges(n, [{ fromA: e, toA: t, fromB: e, toB: t }]);
}
class ji {
  constructor(e) {
    this.context = e, this.tree = e.tree;
  }
  apply(e) {
    if (!e.docChanged && this.tree == this.context.tree)
      return this;
    let t = this.context.changes(e.changes, e.state), i = this.context.treeLen == e.startState.doc.length ? void 0 : Math.max(e.changes.mapPos(this.context.treeLen), t.viewport.to);
    return t.work(20, i) || t.takeTree(), new ji(t);
  }
  static init(e) {
    let t = Math.min(3e3, e.doc.length), i = li.create(e.facet(Lt).parser, e, { from: 0, to: t });
    return i.work(20, t) || i.takeTree(), new ji(i);
  }
}
We.state = /* @__PURE__ */ $e.define({
  create: ji.init,
  update(n, e) {
    for (let t of e.effects)
      if (t.is(We.setState))
        return t.value;
    return e.startState.facet(Lt) != e.state.facet(Lt) ? ji.init(e.state) : n.apply(e);
  }
});
let Zf = (n) => {
  let e = setTimeout(
    () => n(),
    500
    /* Work.MaxPause */
  );
  return () => clearTimeout(e);
};
typeof requestIdleCallback < "u" && (Zf = (n) => {
  let e = -1, t = setTimeout(
    () => {
      e = requestIdleCallback(n, {
        timeout: 400
        /* Work.MinPause */
      });
    },
    100
    /* Work.MinPause */
  );
  return () => e < 0 ? clearTimeout(t) : cancelIdleCallback(e);
});
const zs = typeof navigator < "u" && (!((Ws = navigator.scheduling) === null || Ws === void 0) && Ws.isInputPending) ? () => navigator.scheduling.isInputPending() : null, X0 = /* @__PURE__ */ re.fromClass(class {
  constructor(e) {
    this.view = e, this.working = null, this.workScheduled = 0, this.chunkEnd = -1, this.chunkBudget = -1, this.work = this.work.bind(this), this.scheduleWork();
  }
  update(e) {
    let t = this.view.state.field(We.state).context;
    (t.updateViewport(e.view.viewport) || this.view.viewport.to > t.treeLen) && this.scheduleWork(), (e.docChanged || e.selectionSet) && (this.view.hasFocus && (this.chunkBudget += 50), this.scheduleWork()), this.checkAsyncSchedule(t);
  }
  scheduleWork() {
    if (this.working)
      return;
    let { state: e } = this.view, t = e.field(We.state);
    (t.tree != t.context.tree || !t.context.isDone(e.doc.length)) && (this.working = Zf(this.work));
  }
  work(e) {
    this.working = null;
    let t = Date.now();
    if (this.chunkEnd < t && (this.chunkEnd < 0 || this.view.hasFocus) && (this.chunkEnd = t + 3e4, this.chunkBudget = 3e3), this.chunkBudget <= 0)
      return;
    let { state: i, viewport: { to: r } } = this.view, s = i.field(We.state);
    if (s.tree == s.context.tree && s.context.isDone(
      r + 1e5
      /* Work.MaxParseAhead */
    ))
      return;
    let o = Date.now() + Math.min(this.chunkBudget, 100, e && !zs ? Math.max(25, e.timeRemaining() - 5) : 1e9), l = s.context.treeLen < r && i.doc.length > r + 1e3, a = s.context.work(() => zs && zs() || Date.now() > o, r + (l ? 0 : 1e5));
    this.chunkBudget -= Date.now() - t, (a || this.chunkBudget <= 0) && (s.context.takeTree(), this.view.dispatch({ effects: We.setState.of(new ji(s.context)) })), this.chunkBudget > 0 && !(a && !l) && this.scheduleWork(), this.checkAsyncSchedule(s.context);
  }
  checkAsyncSchedule(e) {
    e.scheduleOn && (this.workScheduled++, e.scheduleOn.then(() => this.scheduleWork()).catch((t) => je(this.view.state, t)).then(() => this.workScheduled--), e.scheduleOn = null);
  }
  destroy() {
    this.working && this.working();
  }
  isWorking() {
    return !!(this.working || this.workScheduled > 0);
  }
}, {
  eventHandlers: { focus() {
    this.scheduleWork();
  } }
}), Lt = /* @__PURE__ */ X.define({
  combine(n) {
    return n.length ? n[0] : null;
  },
  enables: (n) => [
    We.state,
    X0,
    T.contentAttributes.compute([n], (e) => {
      let t = e.facet(n);
      return t && t.name ? { "data-language": t.name } : {};
    })
  ]
});
class ai {
  /**
  Create a language support object.
  */
  constructor(e, t = []) {
    this.language = e, this.support = t, this.extension = [e, t];
  }
}
class jr {
  constructor(e, t, i, r, s, o = void 0) {
    this.name = e, this.alias = t, this.extensions = i, this.filename = r, this.loadFunc = s, this.support = o, this.loading = null;
  }
  /**
  Start loading the the language. Will return a promise that
  resolves to a [`LanguageSupport`](https://codemirror.net/6/docs/ref/#language.LanguageSupport)
  object when the language successfully loads.
  */
  load() {
    return this.loading || (this.loading = this.loadFunc().then((e) => this.support = e, (e) => {
      throw this.loading = null, e;
    }));
  }
  /**
  Create a language description.
  */
  static of(e) {
    let { load: t, support: i } = e;
    if (!t) {
      if (!i)
        throw new RangeError("Must pass either 'load' or 'support' to LanguageDescription.of");
      t = () => Promise.resolve(i);
    }
    return new jr(e.name, (e.alias || []).concat(e.name).map((r) => r.toLowerCase()), e.extensions || [], e.filename, t, i);
  }
  /**
  Look for a language in the given array of descriptions that
  matches the filename. Will first match
  [`filename`](https://codemirror.net/6/docs/ref/#language.LanguageDescription.filename) patterns,
  and then [extensions](https://codemirror.net/6/docs/ref/#language.LanguageDescription.extensions),
  and return the first language that matches.
  */
  static matchFilename(e, t) {
    for (let r of e)
      if (r.filename && r.filename.test(t))
        return r;
    let i = /\.([^.]+)$/.exec(t);
    if (i) {
      for (let r of e)
        if (r.extensions.indexOf(i[1]) > -1)
          return r;
    }
    return null;
  }
  /**
  Look for a language whose name or alias matches the the given
  name (case-insensitively). If `fuzzy` is true, and no direct
  matchs is found, this'll also search for a language whose name
  or alias occurs in the string (for names shorter than three
  characters, only when surrounded by non-word characters).
  */
  static matchLanguageName(e, t, i = !0) {
    t = t.toLowerCase();
    for (let r of e)
      if (r.alias.some((s) => s == t))
        return r;
    if (i)
      for (let r of e)
        for (let s of r.alias) {
          let o = t.indexOf(s);
          if (o > -1 && (s.length > 2 || !/\w/.test(t[o - 1]) && !/\w/.test(t[o + s.length])))
            return r;
        }
    return null;
  }
}
const C0 = /* @__PURE__ */ X.define(), An = /* @__PURE__ */ X.define({
  combine: (n) => {
    if (!n.length)
      return "  ";
    let e = n[0];
    if (!e || /\S/.test(e) || Array.from(e).some((t) => t != e[0]))
      throw new Error("Invalid indent unit: " + JSON.stringify(n[0]));
    return e;
  }
});
function hi(n) {
  let e = n.facet(An);
  return e.charCodeAt(0) == 9 ? n.tabSize * e.length : e.length;
}
function Wr(n, e) {
  let t = "", i = n.tabSize, r = n.facet(An)[0];
  if (r == "	") {
    for (; e >= i; )
      t += "	", e -= i;
    r = " ";
  }
  for (let s = 0; s < e; s++)
    t += r;
  return t;
}
function Rf(n, e) {
  n instanceof D && (n = new Os(n));
  for (let i of n.state.facet(C0)) {
    let r = i(n, e);
    if (r !== void 0)
      return r;
  }
  let t = I(n.state);
  return t.length >= e ? Z0(n, t, e) : null;
}
class Os {
  /**
  Create an indent context.
  */
  constructor(e, t = {}) {
    this.state = e, this.options = t, this.unit = hi(e);
  }
  /**
  Get a description of the line at the given position, taking
  [simulated line
  breaks](https://codemirror.net/6/docs/ref/#language.IndentContext.constructor^options.simulateBreak)
  into account. If there is such a break at `pos`, the `bias`
  argument determines whether the part of the line line before or
  after the break is used.
  */
  lineAt(e, t = 1) {
    let i = this.state.doc.lineAt(e), { simulateBreak: r, simulateDoubleBreak: s } = this.options;
    return r != null && r >= i.from && r <= i.to ? s && r == e ? { text: "", from: e } : (t < 0 ? r < e : r <= e) ? { text: i.text.slice(r - i.from), from: r } : { text: i.text.slice(0, r - i.from), from: i.from } : i;
  }
  /**
  Get the text directly after `pos`, either the entire line
  or the next 100 characters, whichever is shorter.
  */
  textAfterPos(e, t = 1) {
    if (this.options.simulateDoubleBreak && e == this.options.simulateBreak)
      return "";
    let { text: i, from: r } = this.lineAt(e, t);
    return i.slice(e - r, Math.min(i.length, e + 100 - r));
  }
  /**
  Find the column for the given position.
  */
  column(e, t = 1) {
    let { text: i, from: r } = this.lineAt(e, t), s = this.countColumn(i, e - r), o = this.options.overrideIndentation ? this.options.overrideIndentation(r) : -1;
    return o > -1 && (s += o - this.countColumn(i, i.search(/\S|$/))), s;
  }
  /**
  Find the column position (taking tabs into account) of the given
  position in the given string.
  */
  countColumn(e, t = e.length) {
    return ct(e, this.state.tabSize, t);
  }
  /**
  Find the indentation column of the line at the given point.
  */
  lineIndent(e, t = 1) {
    let { text: i, from: r } = this.lineAt(e, t), s = this.options.overrideIndentation;
    if (s) {
      let o = s(r);
      if (o > -1)
        return o;
    }
    return this.countColumn(i, i.search(/\S|$/));
  }
  /**
  Returns the [simulated line
  break](https://codemirror.net/6/docs/ref/#language.IndentContext.constructor^options.simulateBreak)
  for this context, if any.
  */
  get simulatedBreak() {
    return this.options.simulateBreak || null;
  }
}
const Bt = /* @__PURE__ */ new q();
function Z0(n, e, t) {
  let i = e.resolveStack(t), r = e.resolveInner(t, -1).resolve(t, 0).enterUnfinishedNodesBefore(t);
  if (r != i.node) {
    let s = [];
    for (let o = r; o && !(o.from < i.node.from || o.to > i.node.to || o.from == i.node.from && o.type == i.node.type); o = o.parent)
      s.push(o);
    for (let o = s.length - 1; o >= 0; o--)
      i = { node: s[o], next: i };
  }
  return Af(i, n, t);
}
function Af(n, e, t) {
  for (let i = n; i; i = i.next) {
    let r = A0(i.node);
    if (r)
      return r(zl.create(e, t, i));
  }
  return 0;
}
function R0(n) {
  return n.pos == n.options.simulateBreak && n.options.simulateDoubleBreak;
}
function A0(n) {
  let e = n.type.prop(Bt);
  if (e)
    return e;
  let t = n.firstChild, i;
  if (t && (i = t.type.prop(q.closedBy))) {
    let r = n.lastChild, s = r && i.indexOf(r.name) > -1;
    return (o) => qf(o, !0, 1, void 0, s && !R0(o) ? r.from : void 0);
  }
  return n.parent == null ? q0 : null;
}
function q0() {
  return 0;
}
class zl extends Os {
  constructor(e, t, i) {
    super(e.state, e.options), this.base = e, this.pos = t, this.context = i;
  }
  /**
  The syntax tree node to which the indentation strategy
  applies.
  */
  get node() {
    return this.context.node;
  }
  /**
  @internal
  */
  static create(e, t, i) {
    return new zl(e, t, i);
  }
  /**
  Get the text directly after `this.pos`, either the entire line
  or the next 100 characters, whichever is shorter.
  */
  get textAfter() {
    return this.textAfterPos(this.pos);
  }
  /**
  Get the indentation at the reference line for `this.node`, which
  is the line on which it starts, unless there is a node that is
  _not_ a parent of this node covering the start of that line. If
  so, the line at the start of that node is tried, again skipping
  on if it is covered by another such node.
  */
  get baseIndent() {
    return this.baseIndentFor(this.node);
  }
  /**
  Get the indentation for the reference line of the given node
  (see [`baseIndent`](https://codemirror.net/6/docs/ref/#language.TreeIndentContext.baseIndent)).
  */
  baseIndentFor(e) {
    let t = this.state.doc.lineAt(e.from);
    for (; ; ) {
      let i = e.resolve(t.from);
      for (; i.parent && i.parent.from == i.from; )
        i = i.parent;
      if (j0(i, e))
        break;
      t = this.state.doc.lineAt(i.from);
    }
    return this.lineIndent(t.from);
  }
  /**
  Continue looking for indentations in the node's parent nodes,
  and return the result of that.
  */
  continue() {
    return Af(this.context.next, this.base, this.pos);
  }
}
function j0(n, e) {
  for (let t = e; t; t = t.parent)
    if (n == t)
      return !0;
  return !1;
}
function W0(n) {
  let e = n.node, t = e.childAfter(e.from), i = e.lastChild;
  if (!t)
    return null;
  let r = n.options.simulateBreak, s = n.state.doc.lineAt(t.from), o = r == null || r <= s.from ? s.to : Math.min(s.to, r);
  for (let l = t.to; ; ) {
    let a = e.childAfter(l);
    if (!a || a == i)
      return null;
    if (!a.type.isSkipped) {
      if (a.from >= o)
        return null;
      let h = /^ */.exec(s.text.slice(t.to - s.from))[0].length;
      return { from: t.from, to: t.to + h };
    }
    l = a.to;
  }
}
function mr({ closing: n, align: e = !0, units: t = 1 }) {
  return (i) => qf(i, e, t, n);
}
function qf(n, e, t, i, r) {
  let s = n.textAfter, o = s.match(/^\s*/)[0].length, l = i && s.slice(o, o + i.length) == i || r == n.pos + o, a = e ? W0(n) : null;
  return a ? l ? n.column(a.from) : n.column(a.to) : n.baseIndent + (l ? 0 : n.unit * t);
}
const z0 = (n) => n.baseIndent;
function wi({ except: n, units: e = 1 } = {}) {
  return (t) => {
    let i = n && n.test(t.textAfter);
    return t.baseIndent + (i ? 0 : e * t.unit);
  };
}
const jf = /* @__PURE__ */ X.define(), It = /* @__PURE__ */ new q();
function cs(n) {
  let e = n.firstChild, t = n.lastChild;
  return e && e.to < t.from ? { from: e.to, to: t.type.isError ? n.to : t.from } : null;
}
function M0(n, e, t) {
  let i = I(n);
  if (i.length < t)
    return null;
  let r = i.resolveStack(t, 1), s = null;
  for (let o = r; o; o = o.next) {
    let l = o.node;
    if (l.to <= t || l.from > t)
      continue;
    if (s && l.from < e)
      break;
    let a = l.type.prop(It);
    if (a && (l.to < i.length - 50 || i.length == n.doc.length || !_0(l))) {
      let h = a(l, n);
      h && h.from <= t && h.from >= e && h.to > t && (s = h);
    }
  }
  return s;
}
function _0(n) {
  let e = n.lastChild;
  return e && e.to == n.to && e.type.isError;
}
function zr(n, e, t) {
  for (let i of n.facet(jf)) {
    let r = i(n, e, t);
    if (r)
      return r;
  }
  return M0(n, e, t);
}
function Wf(n, e) {
  let t = e.mapPos(n.from, 1), i = e.mapPos(n.to, -1);
  return t >= i ? void 0 : { from: t, to: i };
}
const fs = /* @__PURE__ */ W.define({ map: Wf }), qn = /* @__PURE__ */ W.define({ map: Wf });
function zf(n) {
  let e = [];
  for (let { head: t } of n.state.selection.ranges)
    e.some((i) => i.from <= t && i.to >= t) || e.push(n.lineBlockAt(t));
  return e;
}
const Oi = /* @__PURE__ */ $e.define({
  create() {
    return A.none;
  },
  update(n, e) {
    e.isUserEvent("delete") && e.changes.iterChangedRanges((i, r) => n = Xh(n, i, r)), n = n.map(e.changes);
    let t = [];
    for (let i of e.effects)
      i.is(fs) && !E0(n, i.value.from, i.value.to) ? t.push(i.value) : i.is(qn) && (n = n.update({
        filter: (r, s) => i.value.from != r || i.value.to != s,
        filterFrom: i.value.from,
        filterTo: i.value.to
      }));
    if (t.length) {
      let { preparePlaceholder: i } = e.state.facet(Ef), r = t.map((s) => (i ? A.replace({ widget: new B0(i(e.state, s)) }) : Ch).range(s.from, s.to));
      n = n.update({ add: r });
    }
    return e.selection && (n = Xh(n, e.selection.main.head)), n;
  },
  provide: (n) => T.decorations.from(n),
  toJSON(n, e) {
    let t = [];
    return n.between(0, e.doc.length, (i, r) => {
      t.push(i, r);
    }), t;
  },
  fromJSON(n) {
    if (!Array.isArray(n) || n.length % 2)
      throw new RangeError("Invalid JSON for fold state");
    let e = [];
    for (let t = 0; t < n.length; ) {
      let i = n[t++], r = n[t++];
      if (typeof i != "number" || typeof r != "number")
        throw new RangeError("Invalid JSON for fold state");
      e.push(Ch.range(i, r));
    }
    return A.set(e, !0);
  }
});
function Xh(n, e, t = e) {
  let i = !1;
  return n.between(e, t, (r, s) => {
    r < t && s > e && (i = !0);
  }), i ? n.update({
    filterFrom: e,
    filterTo: t,
    filter: (r, s) => r >= t || s <= e
  }) : n;
}
function Mr(n, e, t) {
  var i;
  let r = null;
  return (i = n.field(Oi, !1)) === null || i === void 0 || i.between(e, t, (s, o) => {
    (!r || r.from > s) && (r = { from: s, to: o });
  }), r;
}
function E0(n, e, t) {
  let i = !1;
  return n.between(e, e, (r, s) => {
    r == e && s == t && (i = !0);
  }), i;
}
function Mf(n, e) {
  return n.field(Oi, !1) ? e : e.concat(W.appendConfig.of(Lf()));
}
const L0 = (n) => {
  for (let e of zf(n)) {
    let t = zr(n.state, e.from, e.to);
    if (t)
      return n.dispatch({ effects: Mf(n.state, [fs.of(t), _f(n, t)]) }), !0;
  }
  return !1;
}, Y0 = (n) => {
  if (!n.state.field(Oi, !1))
    return !1;
  let e = [];
  for (let t of zf(n)) {
    let i = Mr(n.state, t.from, t.to);
    i && e.push(qn.of(i), _f(n, i, !1));
  }
  return e.length && n.dispatch({ effects: e }), e.length > 0;
};
function _f(n, e, t = !0) {
  let i = n.state.doc.lineAt(e.from).number, r = n.state.doc.lineAt(e.to).number;
  return T.announce.of(`${n.state.phrase(t ? "Folded lines" : "Unfolded lines")} ${i} ${n.state.phrase("to")} ${r}.`);
}
const V0 = (n) => {
  let { state: e } = n, t = [];
  for (let i = 0; i < e.doc.length; ) {
    let r = n.lineBlockAt(i), s = zr(e, r.from, r.to);
    s && t.push(fs.of(s)), i = (s ? n.lineBlockAt(s.to) : r).to + 1;
  }
  return t.length && n.dispatch({ effects: Mf(n.state, t) }), !!t.length;
}, U0 = (n) => {
  let e = n.state.field(Oi, !1);
  if (!e || !e.size)
    return !1;
  let t = [];
  return e.between(0, n.state.doc.length, (i, r) => {
    t.push(qn.of({ from: i, to: r }));
  }), n.dispatch({ effects: t }), !0;
}, Xx = [
  { key: "Ctrl-Shift-[", mac: "Cmd-Alt-[", run: L0 },
  { key: "Ctrl-Shift-]", mac: "Cmd-Alt-]", run: Y0 },
  { key: "Ctrl-Alt-[", run: V0 },
  { key: "Ctrl-Alt-]", run: U0 }
], D0 = {
  placeholderDOM: null,
  preparePlaceholder: null,
  placeholderText: "…"
}, Ef = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, D0);
  }
});
function Lf(n) {
  return [Oi, G0];
}
function Yf(n, e) {
  let { state: t } = n, i = t.facet(Ef), r = (o) => {
    let l = n.lineBlockAt(n.posAtDOM(o.target)), a = Mr(n.state, l.from, l.to);
    a && n.dispatch({ effects: qn.of(a) }), o.preventDefault();
  };
  if (i.placeholderDOM)
    return i.placeholderDOM(n, r, e);
  let s = document.createElement("span");
  return s.textContent = i.placeholderText, s.setAttribute("aria-label", t.phrase("folded code")), s.title = t.phrase("unfold"), s.className = "cm-foldPlaceholder", s.onclick = r, s;
}
const Ch = /* @__PURE__ */ A.replace({ widget: /* @__PURE__ */ new class extends Ut {
  toDOM(n) {
    return Yf(n, null);
  }
}() });
class B0 extends Ut {
  constructor(e) {
    super(), this.value = e;
  }
  eq(e) {
    return this.value == e.value;
  }
  toDOM(e) {
    return Yf(e, this.value);
  }
}
const I0 = {
  openText: "⌄",
  closedText: "›",
  markerDOM: null,
  domEventHandlers: {},
  foldingChanged: () => !1
};
class Ms extends $t {
  constructor(e, t) {
    super(), this.config = e, this.open = t;
  }
  eq(e) {
    return this.config == e.config && this.open == e.open;
  }
  toDOM(e) {
    if (this.config.markerDOM)
      return this.config.markerDOM(this.open);
    let t = document.createElement("span");
    return t.textContent = this.open ? this.config.openText : this.config.closedText, t.title = e.state.phrase(this.open ? "Fold line" : "Unfold line"), t;
  }
}
function Cx(n = {}) {
  let e = { ...I0, ...n }, t = new Ms(e, !0), i = new Ms(e, !1), r = re.fromClass(class {
    constructor(o) {
      this.from = o.viewport.from, this.markers = this.buildMarkers(o);
    }
    update(o) {
      (o.docChanged || o.viewportChanged || o.startState.facet(Lt) != o.state.facet(Lt) || o.startState.field(Oi, !1) != o.state.field(Oi, !1) || I(o.startState) != I(o.state) || e.foldingChanged(o)) && (this.markers = this.buildMarkers(o.view));
    }
    buildMarkers(o) {
      let l = new At();
      for (let a of o.viewportLineBlocks) {
        let h = Mr(o.state, a.from, a.to) ? i : zr(o.state, a.from, a.to) ? t : null;
        h && l.add(a.from, a.from, h);
      }
      return l.finish();
    }
  }), { domEventHandlers: s } = e;
  return [
    r,
    Kg({
      class: "cm-foldGutter",
      markers(o) {
        var l;
        return ((l = o.plugin(r)) === null || l === void 0 ? void 0 : l.markers) || _.empty;
      },
      initialSpacer() {
        return new Ms(e, !1);
      },
      domEventHandlers: {
        ...s,
        click: (o, l, a) => {
          if (s.click && s.click(o, l, a))
            return !0;
          let h = Mr(o.state, l.from, l.to);
          if (h)
            return o.dispatch({ effects: qn.of(h) }), !0;
          let O = zr(o.state, l.from, l.to);
          return O ? (o.dispatch({ effects: fs.of(O) }), !0) : !1;
        }
      }
    }),
    Lf()
  ];
}
const G0 = /* @__PURE__ */ T.baseTheme({
  ".cm-foldPlaceholder": {
    backgroundColor: "#eee",
    border: "1px solid #ddd",
    color: "#888",
    borderRadius: ".2em",
    margin: "0 1px",
    padding: "0 1px",
    cursor: "pointer"
  },
  ".cm-foldGutter span": {
    padding: "0 1px",
    cursor: "pointer"
  }
});
class us {
  constructor(e, t) {
    this.specs = e;
    let i;
    function r(l) {
      let a = Wt.newName();
      return (i || (i = /* @__PURE__ */ Object.create(null)))["." + a] = l, a;
    }
    const s = typeof t.all == "string" ? t.all : t.all ? r(t.all) : void 0, o = t.scope;
    this.scope = o instanceof We ? (l) => l.prop(Rt) == o.data : o ? (l) => l == o : void 0, this.style = Cf(e.map((l) => ({
      tag: l.tag,
      class: l.class || r(Object.assign({}, l, { tag: null }))
    })), {
      all: s
    }).style, this.module = i ? new Wt(i) : null, this.themeType = t.themeType;
  }
  /**
  Create a highlighter style that associates the given styles to
  the given tags. The specs must be objects that hold a style tag
  or array of tags in their `tag` property, and either a single
  `class` property providing a static CSS class (for highlighter
  that rely on external styling), or a
  [`style-mod`](https://code.haverbeke.berlin/marijn/style-mod#documentation)-style
  set of CSS properties (which define the styling for those tags).
  
  The CSS rules created for a highlighter will be emitted in the
  order of the spec's properties. That means that for elements that
  have multiple tags associated with them, styles defined further
  down in the list will have a higher CSS precedence than styles
  defined earlier.
  */
  static define(e, t) {
    return new us(e, t || {});
  }
}
const Ho = /* @__PURE__ */ X.define(), Vf = /* @__PURE__ */ X.define({
  combine(n) {
    return n.length ? [n[0]] : null;
  }
});
function _s(n) {
  let e = n.facet(Ho);
  return e.length ? e : n.facet(Vf);
}
function Zx(n, e) {
  let t = [F0], i;
  return n instanceof us && (n.module && t.push(T.styleModule.of(n.module)), i = n.themeType), e?.fallback ? t.push(Vf.of(n)) : i ? t.push(Ho.computeN([T.darkTheme], (r) => r.facet(T.darkTheme) == (i == "dark") ? [n] : [])) : t.push(Ho.of(n)), t;
}
class N0 {
  constructor(e) {
    this.markCache = /* @__PURE__ */ Object.create(null), this.tree = I(e.state), this.decorations = this.buildDeco(e, _s(e.state)), this.decoratedTo = e.viewport.to;
  }
  update(e) {
    let t = I(e.state), i = _s(e.state), r = i != _s(e.startState), { viewport: s } = e.view, o = e.changes.mapPos(this.decoratedTo, 1);
    t.length < s.to && !r && t.type == this.tree.type && o >= s.to ? (this.decorations = this.decorations.map(e.changes), this.decoratedTo = o) : (t != this.tree || e.viewportChanged || r) && (this.tree = t, this.decorations = this.buildDeco(e.view, i), this.decoratedTo = s.to);
  }
  buildDeco(e, t) {
    if (!t || !this.tree.length)
      return A.none;
    let i = new At();
    for (let { from: r, to: s } of e.visibleRanges)
      P0(this.tree, t, (o, l, a) => {
        i.add(o, l, this.markCache[a] || (this.markCache[a] = A.mark({ class: a })));
      }, r, s);
    return i.finish();
  }
}
const F0 = /* @__PURE__ */ xt.high(/* @__PURE__ */ re.fromClass(N0, {
  decorations: (n) => n.decorations
})), Rx = /* @__PURE__ */ us.define([
  {
    tag: m.meta,
    color: "#404740"
  },
  {
    tag: m.link,
    textDecoration: "underline"
  },
  {
    tag: m.heading,
    textDecoration: "underline",
    fontWeight: "bold"
  },
  {
    tag: m.emphasis,
    fontStyle: "italic"
  },
  {
    tag: m.strong,
    fontWeight: "bold"
  },
  {
    tag: m.strikethrough,
    textDecoration: "line-through"
  },
  {
    tag: m.keyword,
    color: "#708"
  },
  {
    tag: [m.atom, m.bool, m.url, m.contentSeparator, m.labelName],
    color: "#219"
  },
  {
    tag: [m.literal, m.inserted],
    color: "#164"
  },
  {
    tag: [m.string, m.deleted],
    color: "#a11"
  },
  {
    tag: [m.regexp, m.escape, /* @__PURE__ */ m.special(m.string)],
    color: "#e40"
  },
  {
    tag: /* @__PURE__ */ m.definition(m.variableName),
    color: "#00f"
  },
  {
    tag: /* @__PURE__ */ m.local(m.variableName),
    color: "#30a"
  },
  {
    tag: [m.typeName, m.namespace],
    color: "#085"
  },
  {
    tag: m.className,
    color: "#167"
  },
  {
    tag: [/* @__PURE__ */ m.special(m.variableName), m.macroName],
    color: "#256"
  },
  {
    tag: /* @__PURE__ */ m.definition(m.propertyName),
    color: "#00c"
  },
  {
    tag: m.comment,
    color: "#940"
  },
  {
    tag: m.invalid,
    color: "#f00"
  }
]), H0 = /* @__PURE__ */ T.baseTheme({
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "#328c8252" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "#bb555544" }
}), Uf = 1e4, Df = "()[]{}", Bf = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, {
      afterCursor: !0,
      brackets: Df,
      maxScanDistance: Uf,
      renderMatch: eQ
    });
  }
}), K0 = /* @__PURE__ */ A.mark({ class: "cm-matchingBracket" }), J0 = /* @__PURE__ */ A.mark({ class: "cm-nonmatchingBracket" });
function eQ(n) {
  let e = [], t = n.matched ? K0 : J0;
  return e.push(t.range(n.start.from, n.start.to)), n.end && e.push(t.range(n.end.from, n.end.to)), e;
}
function Zh(n) {
  let e = [], t = n.facet(Bf);
  for (let i of n.selection.ranges) {
    if (!i.empty)
      continue;
    let r = lt(n, i.head, -1, t) || i.head > 0 && lt(n, i.head - 1, 1, t) || t.afterCursor && (lt(n, i.head, 1, t) || i.head < n.doc.length && lt(n, i.head + 1, -1, t));
    r && (e = e.concat(t.renderMatch(r, n)));
  }
  return A.set(e, !0);
}
const tQ = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.paused = !1, this.decorations = Zh(n.state);
  }
  update(n) {
    (n.docChanged || n.selectionSet || this.paused) && (n.view.composing ? (this.decorations = this.decorations.map(n.changes), this.paused = !0) : (this.decorations = Zh(n.state), this.paused = !1));
  }
}, {
  decorations: (n) => n.decorations
}), iQ = [
  tQ,
  H0
];
function Ax(n = {}) {
  return [Bf.of(n), iQ];
}
const If = /* @__PURE__ */ new q();
function Ko(n, e, t) {
  let i = n.prop(e < 0 ? q.openedBy : q.closedBy);
  if (i)
    return i;
  if (n.name.length == 1) {
    let r = t.indexOf(n.name);
    if (r > -1 && r % 2 == (e < 0 ? 1 : 0))
      return [t[r + e]];
  }
  return null;
}
function Jo(n) {
  let e = n.type.prop(If);
  return e ? e(n.node) : n;
}
function lt(n, e, t, i = {}) {
  let r = i.maxScanDistance || Uf, s = i.brackets || Df, o = I(n), l = o.resolveInner(e, t);
  for (let a = l; a; a = a.parent) {
    let h = Ko(a.type, t, s);
    if (h && a.from < a.to) {
      let O = Jo(a);
      if (O && (t > 0 ? e >= O.from && e < O.to : e > O.from && e <= O.to))
        return nQ(n, e, t, a, O, h, s);
    }
  }
  return rQ(n, e, t, o, l.type, r, s);
}
function nQ(n, e, t, i, r, s, o) {
  let l = i.parent, a = { from: r.from, to: r.to }, h = 0, O = l?.cursor();
  if (O && (t < 0 ? O.childBefore(i.from) : O.childAfter(i.to)))
    do
      if (t < 0 ? O.to <= i.from : O.from >= i.to) {
        if (h == 0 && s.indexOf(O.type.name) > -1 && O.from < O.to) {
          let c = Jo(O);
          return { start: a, end: c ? { from: c.from, to: c.to } : void 0, matched: !0 };
        } else if (Ko(O.type, t, o))
          h++;
        else if (Ko(O.type, -t, o)) {
          if (h == 0) {
            let c = Jo(O);
            return {
              start: a,
              end: c && c.from < c.to ? { from: c.from, to: c.to } : void 0,
              matched: !1
            };
          }
          h--;
        }
      }
    while (t < 0 ? O.prevSibling() : O.nextSibling());
  return { start: a, matched: !1 };
}
function rQ(n, e, t, i, r, s, o) {
  if (t < 0 ? !e : e == n.doc.length)
    return null;
  let l = t < 0 ? n.sliceDoc(e - 1, e) : n.sliceDoc(e, e + 1), a = o.indexOf(l);
  if (a < 0 || a % 2 == 0 != t > 0)
    return null;
  let h = { from: t < 0 ? e - 1 : e, to: t > 0 ? e + 1 : e }, O = n.doc.iterRange(e, t > 0 ? n.doc.length : 0), c = 0;
  for (let f = 0; !O.next().done && f <= s; ) {
    let u = O.value;
    t < 0 && (f += u.length);
    let d = e + f * t;
    for (let p = t > 0 ? 0 : u.length - 1, g = t > 0 ? u.length : -1; p != g; p += t) {
      let Q = o.indexOf(u[p]);
      if (!(Q < 0 || i.resolveInner(d + p, 1).type != r))
        if (Q % 2 == 0 == t > 0)
          c++;
        else {
          if (c == 1)
            return { start: h, end: { from: d + p, to: d + p + 1 }, matched: Q >> 1 == a >> 1 };
          c--;
        }
    }
    t > 0 && (f += u.length);
  }
  return O.done ? { start: h, matched: !1 } : null;
}
function Rh(n, e, t, i = 0, r = 0) {
  e == null && (e = n.search(/[^\s\u00a0]/), e == -1 && (e = n.length));
  let s = r;
  for (let o = i; o < e; o++)
    n.charCodeAt(o) == 9 ? s += t - s % t : s++;
  return s;
}
class Gf {
  /**
  Create a stream.
  */
  constructor(e, t, i, r) {
    this.string = e, this.tabSize = t, this.indentUnit = i, this.overrideIndent = r, this.pos = 0, this.start = 0, this.lastColumnPos = 0, this.lastColumnValue = 0;
  }
  /**
  True if we are at the end of the line.
  */
  eol() {
    return this.pos >= this.string.length;
  }
  /**
  True if we are at the start of the line.
  */
  sol() {
    return this.pos == 0;
  }
  /**
  Get the next code unit after the current position, or undefined
  if we're at the end of the line.
  */
  peek() {
    return this.string.charAt(this.pos) || void 0;
  }
  /**
  Read the next code unit and advance `this.pos`.
  */
  next() {
    if (this.pos < this.string.length)
      return this.string.charAt(this.pos++);
  }
  /**
  Match the next character against the given string, regular
  expression, or predicate. Consume and return it if it matches.
  */
  eat(e) {
    let t = this.string.charAt(this.pos), i;
    if (typeof e == "string" ? i = t == e : i = t && (e instanceof RegExp ? e.test(t) : e(t)), i)
      return ++this.pos, t;
  }
  /**
  Continue matching characters that match the given string,
  regular expression, or predicate function. Return true if any
  characters were consumed.
  */
  eatWhile(e) {
    let t = this.pos;
    for (; this.eat(e); )
      ;
    return this.pos > t;
  }
  /**
  Consume whitespace ahead of `this.pos`. Return true if any was
  found.
  */
  eatSpace() {
    let e = this.pos;
    for (; /[\s\u00a0]/.test(this.string.charAt(this.pos)); )
      ++this.pos;
    return this.pos > e;
  }
  /**
  Move to the end of the line.
  */
  skipToEnd() {
    this.pos = this.string.length;
  }
  /**
  Move to directly before the given character, if found on the
  current line.
  */
  skipTo(e) {
    let t = this.string.indexOf(e, this.pos);
    if (t > -1)
      return this.pos = t, !0;
  }
  /**
  Move back `n` characters.
  */
  backUp(e) {
    this.pos -= e;
  }
  /**
  Get the column position at `this.pos`.
  */
  column() {
    return this.lastColumnPos < this.start && (this.lastColumnValue = Rh(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue), this.lastColumnPos = this.start), this.lastColumnValue;
  }
  /**
  Get the indentation column of the current line.
  */
  indentation() {
    var e;
    return (e = this.overrideIndent) !== null && e !== void 0 ? e : Rh(this.string, null, this.tabSize);
  }
  /**
  Match the input against the given string or regular expression
  (which should start with a `^`). Return true or the regexp match
  if it matches.
  
  Unless `consume` is set to `false`, this will move `this.pos`
  past the matched text.
  
  When matching a string `caseInsensitive` can be set to true to
  make the match case-insensitive.
  */
  match(e, t, i) {
    if (typeof e == "string") {
      let r = (o) => i ? o.toLowerCase() : o, s = this.string.substr(this.pos, e.length);
      return r(s) == r(e) ? (t !== !1 && (this.pos += e.length), !0) : null;
    } else {
      let r = this.string.slice(this.pos).match(e);
      return r && r.index > 0 ? null : (r && t !== !1 && (this.pos += r[0].length), r);
    }
  }
  /**
  Get the current token.
  */
  current() {
    return this.string.slice(this.start, this.pos);
  }
}
function sQ(n) {
  return {
    name: n.name || "",
    token: n.token,
    blankLine: n.blankLine || (() => {
    }),
    startState: n.startState || (() => !0),
    copyState: n.copyState || oQ,
    indent: n.indent || (() => null),
    languageData: n.languageData || {},
    tokenTable: n.tokenTable || _l,
    mergeTokens: n.mergeTokens !== !1
  };
}
function oQ(n) {
  if (typeof n != "object")
    return n;
  let e = {};
  for (let t in n) {
    let i = n[t];
    e[t] = i instanceof Array ? i.slice() : i;
  }
  return e;
}
const Ah = /* @__PURE__ */ new WeakMap();
class Nf extends We {
  constructor(e) {
    let t = hs(e.languageData), i = sQ(e), r, s = new class extends as {
      createParse(o, l, a) {
        return new aQ(r, o, l, a);
      }
    }();
    super(t, s, [], e.name), this.topNode = cQ(t, this), r = this, this.streamParser = i, this.stateAfter = new q({ perNode: !0 }), this.tokenTable = e.tokenTable ? new Jf(i.tokenTable) : OQ;
  }
  /**
  Define a stream language.
  */
  static define(e) {
    return new Nf(e);
  }
  /**
  @internal
  */
  getIndent(e) {
    let t, { overrideIndentation: i } = e.options;
    i && (t = Ah.get(e.state), t != null && t < e.pos - 1e4 && (t = void 0));
    let r = Ml(this, e.node.tree, e.node.from, e.node.from, t ?? e.pos), s, o;
    if (r ? (o = r.state, s = r.pos + 1) : (o = this.streamParser.startState(e.unit), s = e.node.from), e.pos - s > 1e4)
      return null;
    for (; s < e.pos; ) {
      let a = e.state.doc.lineAt(s), h = Math.min(e.pos, a.to);
      if (a.length) {
        let O = i ? i(a.from) : -1, c = new Gf(a.text, e.state.tabSize, e.unit, O < 0 ? void 0 : O);
        for (; c.pos < h - a.from; )
          Hf(this.streamParser.token, c, o);
      } else
        this.streamParser.blankLine(o, e.unit);
      if (h == e.pos)
        break;
      s = a.to + 1;
    }
    let l = e.lineAt(e.pos);
    return i && t == null && Ah.set(e.state, l.from), this.streamParser.indent(o, /^\s*(.*)/.exec(l.text)[1], e);
  }
  get allowsNesting() {
    return !1;
  }
}
function Ml(n, e, t, i, r) {
  let s = t >= i && t + e.length <= r && e.prop(n.stateAfter);
  if (s)
    return { state: n.streamParser.copyState(s), pos: t + e.length };
  for (let o = e.children.length - 1; o >= 0; o--) {
    let l = e.children[o], a = t + e.positions[o], h = l instanceof z && a < r && Ml(n, l, a, i, r);
    if (h)
      return h;
  }
  return null;
}
function Ff(n, e, t, i, r) {
  if (r && t <= 0 && i >= e.length)
    return e;
  !r && t == 0 && e.type == n.topNode && (r = !0);
  for (let s = e.children.length - 1; s >= 0; s--) {
    let o = e.positions[s], l = e.children[s], a;
    if (o < i && l instanceof z) {
      if (!(a = Ff(n, l, t - o, i - o, r)))
        break;
      return r ? new z(e.type, e.children.slice(0, s).concat(a), e.positions.slice(0, s + 1), o + a.length) : a;
    }
  }
  return null;
}
function lQ(n, e, t, i, r) {
  for (let s of e) {
    let o = s.from + (s.openStart ? 25 : 0), l = s.to - (s.openEnd ? 25 : 0), a = o <= t && l > t && Ml(n, s.tree, 0 - s.offset, t, l), h;
    if (a && a.pos <= i && (h = Ff(n, s.tree, t + s.offset, a.pos + s.offset, !1)))
      return { state: a.state, tree: h };
  }
  return { state: n.streamParser.startState(r ? hi(r) : 4), tree: z.empty };
}
let aQ = class {
  constructor(e, t, i, r) {
    this.lang = e, this.input = t, this.fragments = i, this.ranges = r, this.stoppedAt = null, this.chunks = [], this.chunkPos = [], this.chunk = [], this.chunkReused = void 0, this.rangeIndex = 0, this.to = r[r.length - 1].to;
    let s = li.get(), o = r[0].from, { state: l, tree: a } = lQ(e, i, o, this.to, s?.state);
    this.state = l, this.parsedPos = this.chunkStart = o + a.length;
    for (let h = 0; h < a.children.length; h++)
      this.chunks.push(a.children[h]), this.chunkPos.push(a.positions[h]);
    s && this.parsedPos < s.viewport.from - 1e5 && r.some((h) => h.from <= s.viewport.from && h.to >= s.viewport.from) && (this.state = this.lang.streamParser.startState(hi(s.state)), s.skipUntilInView(this.parsedPos, s.viewport.from), this.parsedPos = s.viewport.from), this.moveRangeIndex();
  }
  advance() {
    let e = li.get(), t = this.stoppedAt == null ? this.to : Math.min(this.to, this.stoppedAt), i = Math.min(
      t,
      this.chunkStart + 512
      /* C.ChunkSize */
    );
    for (e && (i = Math.min(i, e.viewport.to)); this.parsedPos < i; )
      this.parseLine(e);
    return this.chunkStart < this.parsedPos && this.finishChunk(), this.parsedPos >= t ? this.finish() : e && this.parsedPos >= e.viewport.to ? (e.skipUntilInView(this.parsedPos, t), this.finish()) : null;
  }
  stopAt(e) {
    this.stoppedAt = e;
  }
  lineAfter(e) {
    let t = this.input.chunk(e);
    if (this.input.lineChunks)
      t == `
` && (t = "");
    else {
      let i = t.indexOf(`
`);
      i > -1 && (t = t.slice(0, i));
    }
    return e + t.length <= this.to ? t : t.slice(0, this.to - e);
  }
  nextLine() {
    let e = this.parsedPos, t = this.lineAfter(e), i = e + t.length;
    for (let r = this.rangeIndex; ; ) {
      let s = this.ranges[r].to;
      if (s >= i || (t = t.slice(0, s - (i - t.length)), r++, r == this.ranges.length))
        break;
      let o = this.ranges[r].from, l = this.lineAfter(o);
      t += l, i = o + l.length;
    }
    return { line: t, end: i };
  }
  skipGapsTo(e, t, i) {
    for (; ; ) {
      let r = this.ranges[this.rangeIndex].to, s = e + t;
      if (i > 0 ? r > s : r >= s)
        break;
      let o = this.ranges[++this.rangeIndex].from;
      t += o - r;
    }
    return t;
  }
  moveRangeIndex() {
    for (; this.ranges[this.rangeIndex].to < this.parsedPos; )
      this.rangeIndex++;
  }
  emitToken(e, t, i, r) {
    let s = 4;
    if (this.ranges.length > 1) {
      r = this.skipGapsTo(t, r, 1), t += r;
      let l = this.chunk.length;
      r = this.skipGapsTo(i, r, -1), i += r, s += this.chunk.length - l;
    }
    let o = this.chunk.length - 4;
    return this.lang.streamParser.mergeTokens && s == 4 && o >= 0 && this.chunk[o] == e && this.chunk[o + 2] == t ? this.chunk[o + 2] = i : this.chunk.push(e, t, i, s), r;
  }
  parseLine(e) {
    let { line: t, end: i } = this.nextLine(), r = 0, { streamParser: s } = this.lang, o = new Gf(t, e ? e.state.tabSize : 4, e ? hi(e.state) : 2);
    if (o.eol())
      s.blankLine(this.state, o.indentUnit);
    else
      for (; !o.eol(); ) {
        let l = Hf(s.token, o, this.state);
        if (l && (r = this.emitToken(this.lang.tokenTable.resolve(l), this.parsedPos + o.start, this.parsedPos + o.pos, r)), o.start > 1e4)
          break;
      }
    this.parsedPos = i, this.moveRangeIndex(), this.parsedPos < this.to && this.parsedPos++;
  }
  finishChunk() {
    let e = z.build({
      buffer: this.chunk,
      start: this.chunkStart,
      length: this.parsedPos - this.chunkStart,
      nodeSet: hQ,
      topID: 0,
      maxBufferLength: 512,
      reused: this.chunkReused
    });
    e = new z(e.type, e.children, e.positions, e.length, [[this.lang.stateAfter, this.lang.streamParser.copyState(this.state)]]), this.chunks.push(e), this.chunkPos.push(this.chunkStart - this.ranges[0].from), this.chunk = [], this.chunkReused = void 0, this.chunkStart = this.parsedPos;
  }
  finish() {
    return new z(this.lang.topNode, this.chunks, this.chunkPos, this.parsedPos - this.ranges[0].from).balance();
  }
};
function Hf(n, e, t) {
  e.start = e.pos;
  for (let i = 0; i < 10; i++) {
    let r = n(e, t);
    if (e.pos > e.start)
      return r;
  }
  throw new Error("Stream parser failed to advance stream.");
}
const _l = /* @__PURE__ */ Object.create(null), bn = [se.none], hQ = /* @__PURE__ */ new _i(bn), qh = [], jh = /* @__PURE__ */ Object.create(null), Kf = /* @__PURE__ */ Object.create(null);
for (let [n, e] of [
  ["variable", "variableName"],
  ["variable-2", "variableName.special"],
  ["string-2", "string.special"],
  ["def", "variableName.definition"],
  ["tag", "tagName"],
  ["attribute", "attributeName"],
  ["type", "typeName"],
  ["builtin", "variableName.standard"],
  ["qualifier", "modifier"],
  ["error", "invalid"],
  ["header", "heading"],
  ["property", "propertyName"]
])
  Kf[n] = /* @__PURE__ */ eu(_l, e);
class Jf {
  constructor(e) {
    this.extra = e, this.table = Object.assign(/* @__PURE__ */ Object.create(null), Kf);
  }
  resolve(e) {
    return e ? this.table[e] || (this.table[e] = eu(this.extra, e)) : 0;
  }
}
const OQ = /* @__PURE__ */ new Jf(_l);
function Es(n, e) {
  qh.indexOf(n) > -1 || (qh.push(n), console.warn(e));
}
function eu(n, e) {
  let t = [];
  for (let l of e.split(" ")) {
    let a = [];
    for (let h of l.split(".")) {
      let O = n[h] || m[h];
      O ? typeof O == "function" ? a.length ? a = a.map(O) : Es(h, `Modifier ${h} used at start of tag`) : a.length ? Es(h, `Tag ${h} used as modifier`) : a = Array.isArray(O) ? O : [O] : Es(h, `Unknown highlighting tag ${h}`);
    }
    for (let h of a)
      t.push(h);
  }
  if (!t.length)
    return 0;
  let i = e.replace(/ /g, "_"), r = i + " " + t.map((l) => l.id), s = jh[r];
  if (s)
    return s.id;
  let o = jh[r] = se.define({
    id: bn.length,
    name: i,
    props: [Dt({ [i]: t })]
  });
  return bn.push(o), o.id;
}
function cQ(n, e) {
  let t = se.define({ id: bn.length, name: "Document", props: [
    Rt.add(() => n),
    Bt.add(() => (i) => e.getIndent(i))
  ], top: !0 });
  return bn.push(t), t;
}
K.RTL, K.LTR;
const fQ = (n) => {
  let { state: e } = n, t = e.doc.lineAt(e.selection.main.from), i = Ll(n.state, t.from);
  return i.line ? uQ(n) : i.block ? pQ(n) : !1;
};
function El(n, e) {
  return ({ state: t, dispatch: i }) => {
    if (t.readOnly)
      return !1;
    let r = n(e, t);
    return r ? (i(t.update(r)), !0) : !1;
  };
}
const uQ = /* @__PURE__ */ El(
  QQ,
  0
  /* CommentOption.Toggle */
), dQ = /* @__PURE__ */ El(
  tu,
  0
  /* CommentOption.Toggle */
), pQ = /* @__PURE__ */ El(
  (n, e) => tu(n, e, gQ(e)),
  0
  /* CommentOption.Toggle */
);
function Ll(n, e) {
  let t = n.languageDataAt("commentTokens", e, 1);
  return t.length ? t[0] : {};
}
const Ii = 50;
function mQ(n, { open: e, close: t }, i, r) {
  let s = n.sliceDoc(i - Ii, i), o = n.sliceDoc(r, r + Ii), l = /\s*$/.exec(s)[0].length, a = /^\s*/.exec(o)[0].length, h = s.length - l;
  if (s.slice(h - e.length, h) == e && o.slice(a, a + t.length) == t)
    return {
      open: { pos: i - l, margin: l && 1 },
      close: { pos: r + a, margin: a && 1 }
    };
  let O, c;
  r - i <= 2 * Ii ? O = c = n.sliceDoc(i, r) : (O = n.sliceDoc(i, i + Ii), c = n.sliceDoc(r - Ii, r));
  let f = /^\s*/.exec(O)[0].length, u = /\s*$/.exec(c)[0].length, d = c.length - u - t.length;
  return O.slice(f, f + e.length) == e && c.slice(d, d + t.length) == t ? {
    open: {
      pos: i + f + e.length,
      margin: /\s/.test(O.charAt(f + e.length)) ? 1 : 0
    },
    close: {
      pos: r - u - t.length,
      margin: /\s/.test(c.charAt(d - 1)) ? 1 : 0
    }
  } : null;
}
function gQ(n) {
  let e = [];
  for (let t of n.selection.ranges) {
    let i = n.doc.lineAt(t.from), r = t.to <= i.to ? i : n.doc.lineAt(t.to);
    r.from > i.from && r.from == t.to && (r = t.to == i.to + 1 ? i : n.doc.lineAt(t.to - 1));
    let s = e.length - 1;
    s >= 0 && e[s].to > i.from ? e[s].to = r.to : e.push({ from: i.from + /^\s*/.exec(i.text)[0].length, to: r.to });
  }
  return e;
}
function tu(n, e, t = e.selection.ranges) {
  let i = t.map((s) => Ll(e, s.from).block);
  if (!i.every((s) => s))
    return null;
  let r = t.map((s, o) => mQ(e, i[o], s.from, s.to));
  if (n != 2 && !r.every((s) => s))
    return { changes: e.changes(t.map((s, o) => r[o] ? [] : [{ from: s.from, insert: i[o].open + " " }, { from: s.to, insert: " " + i[o].close }])) };
  if (n != 1 && r.some((s) => s)) {
    let s = [];
    for (let o = 0, l; o < r.length; o++)
      if (l = r[o]) {
        let a = i[o], { open: h, close: O } = l;
        s.push({ from: h.pos - a.open.length, to: h.pos + h.margin }, { from: O.pos - O.margin, to: O.pos + a.close.length });
      }
    return { changes: s };
  }
  return null;
}
function QQ(n, e, t = e.selection.ranges) {
  let i = [], r = -1;
  e: for (let { from: s, to: o } of t) {
    let l = i.length, a = 1e9, h;
    for (let O = s; O <= o; ) {
      let c = e.doc.lineAt(O);
      if (h == null && (h = Ll(e, c.from).line, !h))
        continue e;
      if (c.from > r && (s == o || o > c.from)) {
        r = c.from;
        let f = /^\s*/.exec(c.text)[0].length, u = f == c.length, d = c.text.slice(f, f + h.length) == h ? f : -1;
        f < c.text.length && f < a && (a = f), i.push({ line: c, comment: d, token: h, indent: f, empty: u, single: !1 });
      }
      O = c.to + 1;
    }
    if (a < 1e9)
      for (let O = l; O < i.length; O++)
        i[O].indent < i[O].line.text.length && (i[O].indent = a);
    i.length == l + 1 && (i[l].single = !0);
  }
  if (n != 2 && i.some((s) => s.comment < 0 && (!s.empty || s.single))) {
    let s = [];
    for (let { line: l, token: a, indent: h, empty: O, single: c } of i)
      (c || !O) && s.push({ from: l.from + h, insert: a + " " });
    let o = e.changes(s);
    return { changes: o, selection: e.selection.map(o, 1) };
  } else if (n != 1 && i.some((s) => s.comment >= 0)) {
    let s = [];
    for (let { line: o, comment: l, token: a } of i)
      if (l >= 0) {
        let h = o.from + l, O = h + a.length;
        o.text[O - o.from] == " " && O++, s.push({ from: h, to: O });
      }
    return { changes: s };
  }
  return null;
}
const el = /* @__PURE__ */ Pt.define(), SQ = /* @__PURE__ */ Pt.define(), bQ = /* @__PURE__ */ X.define(), iu = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, {
      minDepth: 100,
      newGroupDelay: 500,
      joinToEvent: (e, t) => t
    }, {
      minDepth: Math.max,
      newGroupDelay: Math.min,
      joinToEvent: (e, t) => (i, r) => e(i, r) || t(i, r)
    });
  }
}), nu = /* @__PURE__ */ $e.define({
  create() {
    return at.empty;
  },
  update(n, e) {
    let t = e.state.facet(iu), i = e.annotation(el);
    if (i) {
      let a = we.fromTransaction(e, i.selection), h = i.side, O = h == 0 ? n.undone : n.done;
      return a ? O = _r(O, O.length, t.minDepth, a) : O = ou(O, e.startState.selection), new at(h == 0 ? i.rest : O, h == 0 ? O : i.rest);
    }
    let r = e.annotation(SQ);
    if ((r == "full" || r == "before") && (n = n.isolate()), e.annotation(ne.addToHistory) === !1)
      return e.changes.empty ? n : n.addMapping(e.changes.desc);
    let s = we.fromTransaction(e), o = e.annotation(ne.time), l = e.annotation(ne.userEvent);
    return s ? n = n.addChanges(s, o, l, t, e) : e.selection && (n = n.addSelection(e.startState.selection, o, l, t.newGroupDelay)), (r == "full" || r == "after") && (n = n.isolate()), n;
  },
  toJSON(n) {
    return { done: n.done.map((e) => e.toJSON()), undone: n.undone.map((e) => e.toJSON()) };
  },
  fromJSON(n) {
    return new at(n.done.map(we.fromJSON), n.undone.map(we.fromJSON));
  }
});
function jx(n = {}) {
  return [
    nu,
    iu.of(n),
    T.domEventHandlers({
      beforeinput(e, t) {
        let i = e.inputType == "historyUndo" ? ru : e.inputType == "historyRedo" ? tl : null;
        return i ? (e.preventDefault(), i(t)) : !1;
      }
    })
  ];
}
function ds(n, e) {
  return function({ state: t, dispatch: i }) {
    if (!e && t.readOnly)
      return !1;
    let r = t.field(nu, !1);
    if (!r)
      return !1;
    let s = r.pop(n, t, e);
    return s ? (i(s), !0) : !1;
  };
}
const ru = /* @__PURE__ */ ds(0, !1), tl = /* @__PURE__ */ ds(1, !1), yQ = /* @__PURE__ */ ds(0, !0), kQ = /* @__PURE__ */ ds(1, !0);
class we {
  constructor(e, t, i, r, s) {
    this.changes = e, this.effects = t, this.mapped = i, this.startSelection = r, this.selectionsAfter = s;
  }
  setSelAfter(e) {
    return new we(this.changes, this.effects, this.mapped, this.startSelection, e);
  }
  toJSON() {
    var e, t, i;
    return {
      changes: (e = this.changes) === null || e === void 0 ? void 0 : e.toJSON(),
      mapped: (t = this.mapped) === null || t === void 0 ? void 0 : t.toJSON(),
      startSelection: (i = this.startSelection) === null || i === void 0 ? void 0 : i.toJSON(),
      selectionsAfter: this.selectionsAfter.map((r) => r.toJSON())
    };
  }
  static fromJSON(e) {
    return new we(e.changes && oe.fromJSON(e.changes), [], e.mapped && ht.fromJSON(e.mapped), e.startSelection && S.fromJSON(e.startSelection), e.selectionsAfter.map(S.fromJSON));
  }
  // This does not check `addToHistory` and such, it assumes the
  // transaction needs to be converted to an item. Returns null when
  // there are no changes or effects in the transaction.
  static fromTransaction(e, t) {
    let i = Le;
    for (let r of e.startState.facet(bQ)) {
      let s = r(e);
      s.length && (i = i.concat(s));
    }
    return !i.length && e.changes.empty ? null : new we(e.changes.invert(e.startState.doc), i, void 0, t || e.startState.selection, Le);
  }
  static selection(e) {
    return new we(void 0, Le, void 0, void 0, e);
  }
}
function _r(n, e, t, i) {
  let r = e + 1 > t + 20 ? e - t - 1 : 0, s = n.slice(r, e);
  return s.push(i), s;
}
function $Q(n, e) {
  let t = [], i = !1;
  return n.iterChangedRanges((r, s) => t.push(r, s)), e.iterChangedRanges((r, s, o, l) => {
    for (let a = 0; a < t.length; ) {
      let h = t[a++], O = t[a++];
      l >= h && o <= O && (i = !0);
    }
  }), i;
}
function xQ(n, e) {
  return n.ranges.length == e.ranges.length && n.ranges.filter((t, i) => t.empty != e.ranges[i].empty).length === 0;
}
function su(n, e) {
  return n.length ? e.length ? n.concat(e) : n : e;
}
const Le = [], PQ = 200;
function ou(n, e) {
  if (n.length) {
    let t = n[n.length - 1], i = t.selectionsAfter.slice(Math.max(0, t.selectionsAfter.length - PQ));
    return i.length && i[i.length - 1].eq(e) ? n : (i.push(e), _r(n, n.length - 1, 1e9, t.setSelAfter(i)));
  } else
    return [we.selection([e])];
}
function wQ(n) {
  let e = n[n.length - 1], t = n.slice();
  return t[n.length - 1] = e.setSelAfter(e.selectionsAfter.slice(0, e.selectionsAfter.length - 1)), t;
}
function Ls(n, e) {
  if (!n.length)
    return n;
  let t = n.length, i = Le;
  for (; t; ) {
    let r = vQ(n[t - 1], e, i);
    if (r.changes && !r.changes.empty || r.effects.length) {
      let s = n.slice(0, t);
      return s[t - 1] = r, s;
    } else
      e = r.mapped, t--, i = r.selectionsAfter;
  }
  return i.length ? [we.selection(i)] : Le;
}
function vQ(n, e, t) {
  let i = su(n.selectionsAfter.length ? n.selectionsAfter.map((l) => l.map(e)) : Le, t);
  if (!n.changes)
    return we.selection(i);
  let r = n.changes.map(e), s = e.mapDesc(n.changes, !0), o = n.mapped ? n.mapped.composeDesc(s) : s;
  return new we(r, W.mapEffects(n.effects, e), o, n.startSelection.map(s), i);
}
const TQ = /^(input\.type|delete)($|\.)/;
class at {
  constructor(e, t, i = 0, r = void 0) {
    this.done = e, this.undone = t, this.prevTime = i, this.prevUserEvent = r;
  }
  isolate() {
    return this.prevTime ? new at(this.done, this.undone) : this;
  }
  addChanges(e, t, i, r, s) {
    let o = this.done, l = o[o.length - 1];
    return l && l.changes && !l.changes.empty && e.changes && (!i || TQ.test(i)) && (!l.selectionsAfter.length && t - this.prevTime < r.newGroupDelay && r.joinToEvent(s, $Q(l.changes, e.changes)) || // For compose (but not compose.start) events, always join with previous event
    i == "input.type.compose") ? o = _r(o, o.length - 1, r.minDepth, new we(e.changes.compose(l.changes), su(W.mapEffects(e.effects, l.changes), l.effects), l.mapped, l.startSelection, Le)) : o = _r(o, o.length, r.minDepth, e), new at(o, Le, t, i);
  }
  addSelection(e, t, i, r) {
    let s = this.done.length ? this.done[this.done.length - 1].selectionsAfter : Le;
    return s.length > 0 && t - this.prevTime < r && i == this.prevUserEvent && i && /^select($|\.)/.test(i) && xQ(s[s.length - 1], e) ? this : new at(ou(this.done, e), this.undone, t, i);
  }
  addMapping(e) {
    return new at(Ls(this.done, e), Ls(this.undone, e), this.prevTime, this.prevUserEvent);
  }
  pop(e, t, i) {
    let r = e == 0 ? this.done : this.undone;
    if (r.length == 0)
      return null;
    let s = r[r.length - 1], o = s.selectionsAfter[0] || (s.startSelection ? s.startSelection.map(s.changes.invertedDesc, 1) : t.selection);
    if (i && s.selectionsAfter.length)
      return t.update({
        selection: s.selectionsAfter[s.selectionsAfter.length - 1],
        annotations: el.of({ side: e, rest: wQ(r), selection: o }),
        userEvent: e == 0 ? "select.undo" : "select.redo",
        scrollIntoView: !0
      });
    if (s.changes) {
      let l = r.length == 1 ? Le : r.slice(0, r.length - 1);
      return s.mapped && (l = Ls(l, s.mapped)), t.update({
        changes: s.changes,
        selection: s.startSelection,
        effects: s.effects,
        annotations: el.of({ side: e, rest: l, selection: o }),
        filter: !1,
        userEvent: e == 0 ? "undo" : "redo",
        scrollIntoView: !0
      });
    } else
      return null;
  }
}
at.empty = /* @__PURE__ */ new at(Le, Le);
const Wx = [
  { key: "Mod-z", run: ru, preventDefault: !0 },
  { key: "Mod-y", mac: "Mod-Shift-z", run: tl, preventDefault: !0 },
  { linux: "Ctrl-Shift-z", run: tl, preventDefault: !0 },
  { key: "Mod-u", run: yQ, preventDefault: !0 },
  { key: "Alt-u", mac: "Mod-Shift-u", run: kQ, preventDefault: !0 }
];
function Ei(n, e) {
  return S.create(n.ranges.map(e), n.mainIndex);
}
function Ge(n, e) {
  return n.update({ selection: e, scrollIntoView: !0, userEvent: "select" });
}
function Ne({ state: n, dispatch: e }, t) {
  let i = Ei(n.selection, t);
  return i.eq(n.selection, !0) ? !1 : (e(Ge(n, i)), !0);
}
function ps(n, e) {
  return S.cursor(e ? n.to : n.from);
}
function lu(n, e) {
  return Ne(n, (t) => t.empty ? n.moveByChar(t, e) : ps(t, e));
}
function Qe(n) {
  return n.textDirectionAt(n.state.selection.main.head) == K.LTR;
}
const au = (n) => lu(n, !Qe(n)), hu = (n) => lu(n, Qe(n));
function Ou(n, e) {
  return Ne(n, (t) => t.empty ? n.moveByGroup(t, e) : ps(t, e));
}
const XQ = (n) => Ou(n, !Qe(n)), CQ = (n) => Ou(n, Qe(n));
function ZQ(n, e, t) {
  if (e.type.prop(t))
    return !0;
  let i = e.to - e.from;
  return i && (i > 2 || /[^\s,.;:]/.test(n.sliceDoc(e.from, e.to))) || e.firstChild;
}
function ms(n, e, t) {
  let i = I(n).resolveInner(e.head), r = t ? q.closedBy : q.openedBy;
  for (let a = e.head; ; ) {
    let h = t ? i.childAfter(a) : i.childBefore(a);
    if (!h)
      break;
    ZQ(n, h, r) ? i = h : a = t ? h.to : h.from;
  }
  let s = i.type.prop(r), o, l;
  return s && (o = t ? lt(n, i.from, 1) : lt(n, i.to, -1)) && o.matched ? l = t ? o.end.to : o.end.from : l = t ? i.to : i.from, S.cursor(l, t ? -1 : 1);
}
const RQ = (n) => Ne(n, (e) => ms(n.state, e, !Qe(n))), AQ = (n) => Ne(n, (e) => ms(n.state, e, Qe(n)));
function cu(n, e) {
  return Ne(n, (t) => {
    if (!t.empty)
      return ps(t, e);
    let i = n.moveVertically(t, e);
    return i.head != t.head ? i : n.moveToLineBoundary(t, e);
  });
}
const fu = (n) => cu(n, !1), uu = (n) => cu(n, !0);
function du(n) {
  let e = n.scrollDOM.clientHeight < n.scrollDOM.scrollHeight - 2, t = 0, i = 0, r;
  if (e) {
    for (let s of n.state.facet(T.scrollMargins)) {
      let o = s(n);
      o?.top && (t = Math.max(o?.top, t)), o?.bottom && (i = Math.max(o?.bottom, i));
    }
    r = n.scrollDOM.clientHeight - t - i;
  } else
    r = (n.dom.ownerDocument.defaultView || window).innerHeight;
  return {
    marginTop: t,
    marginBottom: i,
    selfScroll: e,
    height: Math.max(n.defaultLineHeight, r - 5)
  };
}
function pu(n, e) {
  let t = du(n), { state: i } = n, r = Ei(i.selection, (o) => o.empty ? n.moveVertically(o, e, t.height) : ps(o, e));
  if (r.eq(i.selection))
    return !1;
  let s;
  if (t.selfScroll) {
    let o = n.coordsAtPos(i.selection.main.head), l = n.scrollDOM.getBoundingClientRect(), a = l.top + t.marginTop, h = l.bottom - t.marginBottom;
    o && o.top > a && o.bottom < h && (s = T.scrollIntoView(r.main.head, { y: "start", yMargin: o.top - a }));
  }
  return n.dispatch(Ge(i, r), { effects: s }), !0;
}
const Wh = (n) => pu(n, !1), il = (n) => pu(n, !0);
function Gt(n, e, t) {
  let i = n.lineBlockAt(e.head), r = n.moveToLineBoundary(e, t);
  if (r.head == e.head && r.head != (t ? i.to : i.from) && (r = n.moveToLineBoundary(e, t, !1)), !t && r.head == i.from && i.length) {
    let s = /^\s*/.exec(n.state.sliceDoc(i.from, Math.min(i.from + 100, i.to)))[0].length;
    s && e.head != i.from + s && (r = S.cursor(i.from + s));
  }
  return r;
}
const qQ = (n) => Ne(n, (e) => Gt(n, e, !0)), jQ = (n) => Ne(n, (e) => Gt(n, e, !1)), WQ = (n) => Ne(n, (e) => Gt(n, e, !Qe(n))), zQ = (n) => Ne(n, (e) => Gt(n, e, Qe(n))), MQ = (n) => Ne(n, (e) => n.moveToLineBoundary(e, !1, !1)), _Q = (n) => Ne(n, (e) => n.moveToLineBoundary(e, !0, !1));
function EQ(n, e, t) {
  let i = !1, r = Ei(n.selection, (s) => {
    let o = lt(n, s.head, -1) || lt(n, s.head, 1) || s.head > 0 && lt(n, s.head - 1, 1) || s.head < n.doc.length && lt(n, s.head + 1, -1);
    if (!o || !o.end)
      return s;
    i = !0;
    let l = o.start.from == s.head ? o.end.to : o.end.from;
    return S.cursor(l);
  });
  return i ? (e(Ge(n, r)), !0) : !1;
}
const LQ = ({ state: n, dispatch: e }) => EQ(n, e);
function Ve(n, e, t) {
  let i = Ei(n.state.selection, (r) => {
    r.undirectional && r.head >= r.anchor != e && (r = S.range(r.head, r.anchor));
    let s = t(r);
    return S.range(r.anchor, s.head, s.goalColumn, s.bidiLevel || void 0, s.assoc);
  });
  return i.eq(n.state.selection) ? !1 : (n.dispatch(Ge(n.state, i)), !0);
}
function mu(n, e) {
  return Ve(n, e, (t) => n.moveByChar(t, e));
}
const gu = (n) => mu(n, !Qe(n)), Qu = (n) => mu(n, Qe(n));
function Su(n, e) {
  return Ve(n, e, (t) => n.moveByGroup(t, e));
}
const YQ = (n) => Su(n, !Qe(n)), VQ = (n) => Su(n, Qe(n)), UQ = (n) => {
  let e = !Qe(n);
  return Ve(n, e, (t) => ms(n.state, t, e));
}, DQ = (n) => {
  let e = Qe(n);
  return Ve(n, e, (t) => ms(n.state, t, e));
};
function bu(n, e) {
  return Ve(n, e, (t) => n.moveVertically(t, e));
}
const yu = (n) => bu(n, !1), ku = (n) => bu(n, !0);
function $u(n, e) {
  return Ve(n, e, (t) => n.moveVertically(t, e, du(n).height));
}
const zh = (n) => $u(n, !1), Mh = (n) => $u(n, !0), BQ = (n) => Ve(n, !0, (e) => Gt(n, e, !0)), IQ = (n) => Ve(n, !1, (e) => Gt(n, e, !1)), GQ = (n) => {
  let e = !Qe(n);
  return Ve(n, e, (t) => Gt(n, t, e));
}, NQ = (n) => {
  let e = Qe(n);
  return Ve(n, e, (t) => Gt(n, t, e));
}, FQ = (n) => Ve(n, !1, (e) => S.cursor(n.lineBlockAt(e.head).from)), HQ = (n) => Ve(n, !0, (e) => S.cursor(n.lineBlockAt(e.head).to)), _h = ({ state: n, dispatch: e }) => (e(Ge(n, { anchor: 0 })), !0), Eh = ({ state: n, dispatch: e }) => (e(Ge(n, { anchor: n.doc.length })), !0), Lh = ({ state: n, dispatch: e }) => (e(Ge(n, { anchor: n.selection.main.anchor, head: 0 })), !0), Yh = ({ state: n, dispatch: e }) => (e(Ge(n, { anchor: n.selection.main.anchor, head: n.doc.length })), !0), KQ = ({ state: n, dispatch: e }) => (e(n.update({ selection: { anchor: 0, head: n.doc.length }, userEvent: "select" })), !0), JQ = ({ state: n, dispatch: e }) => {
  let t = gs(n).map(({ from: i, to: r }) => S.undirectionalRange(i, Math.min(r + 1, n.doc.length)));
  return e(n.update({ selection: S.create(t), userEvent: "select" })), !0;
}, eS = ({ state: n, dispatch: e }) => {
  let t = Ei(n.selection, (i) => {
    let r = I(n), s = r.resolveStack(i.from, 1);
    if (i.empty) {
      let o = r.resolveStack(i.from, -1);
      o.node.from >= s.node.from && o.node.to <= s.node.to && (s = o);
    }
    for (let o = s; o; o = o.next) {
      let { node: l } = o;
      if ((l.from < i.from && l.to >= i.to || l.to > i.to && l.from <= i.from) && o.next)
        return S.undirectionalRange(l.from, l.to);
    }
    return i;
  });
  return t.eq(n.selection) ? !1 : (e(Ge(n, t)), !0);
};
function xu(n, e) {
  let { state: t } = n, i = t.selection, r = t.selection.ranges.slice();
  for (let s of t.selection.ranges) {
    let o = t.doc.lineAt(s.head);
    if (e ? o.to < n.state.doc.length : o.from > 0)
      for (let l = s; ; ) {
        let a = n.moveVertically(l, e);
        if (a.head < o.from || a.head > o.to) {
          r.some((h) => h.head == a.head) || r.push(a);
          break;
        } else {
          if (a.head == l.head)
            break;
          l = a;
        }
      }
  }
  return r.length == i.ranges.length ? !1 : (n.dispatch(Ge(t, S.create(r, r.length - 1))), !0);
}
const tS = (n) => xu(n, !1), iS = (n) => xu(n, !0), nS = ({ state: n, dispatch: e }) => {
  let t = n.selection, i = null;
  return t.ranges.length > 1 ? i = S.create([t.main]) : t.main.empty || (i = S.create([S.cursor(t.main.head)])), i ? (e(Ge(n, i)), !0) : !1;
};
function jn(n, e) {
  if (n.state.readOnly)
    return !1;
  let t = "delete.selection", { state: i } = n, r = i.changeByRange((s) => {
    let { from: o, to: l } = s;
    if (o == l) {
      let a = e(s);
      a < o ? (t = "delete.backward", a = ir(n, a, !1)) : a > o && (t = "delete.forward", a = ir(n, a, !0)), o = Math.min(o, a), l = Math.max(l, a);
    } else
      o = ir(n, o, !1), l = ir(n, l, !0);
    return o == l ? { range: s } : { changes: { from: o, to: l }, range: S.cursor(o, o < s.head ? -1 : 1) };
  });
  return r.changes.empty ? !1 : (n.dispatch(i.update(r, {
    scrollIntoView: !0,
    userEvent: t,
    effects: t == "delete.selection" ? T.announce.of(i.phrase("Selection deleted")) : void 0
  })), !0);
}
function ir(n, e, t) {
  if (n instanceof T)
    for (let i of n.state.facet(T.atomicRanges).map((r) => r(n)))
      i.between(e, e, (r, s) => {
        r < e && s > e && (e = t ? s : r);
      });
  return e;
}
const Pu = (n, e, t) => jn(n, (i) => {
  let r = i.from, { state: s } = n, o = s.doc.lineAt(r), l, a;
  if (t && !e && r > o.from && r < o.from + 200 && !/[^ \t]/.test(l = o.text.slice(0, r - o.from))) {
    if (l[l.length - 1] == "	")
      return r - 1;
    let h = ct(l, s.tabSize), O = h % hi(s) || hi(s);
    for (let c = 0; c < O && l[l.length - 1 - c] == " "; c++)
      r--;
    a = r;
  } else
    a = he(o.text, r - o.from, e, e) + o.from, a == r && o.number != (e ? s.doc.lines : 1) ? a += e ? 1 : -1 : !e && /[\ufe00-\ufe0f]/.test(o.text.slice(a - o.from, r - o.from)) && (a = he(o.text, a - o.from, !1, !1) + o.from);
  return a;
}), nl = (n) => Pu(n, !1, !0), wu = (n) => Pu(n, !0, !1), vu = (n, e) => jn(n, (t) => {
  let i = t.head, { state: r } = n, s = r.doc.lineAt(i), o = r.charCategorizer(i);
  for (let l = null; ; ) {
    if (i == (e ? s.to : s.from)) {
      i == t.head && s.number != (e ? r.doc.lines : 1) && (i += e ? 1 : -1);
      break;
    }
    let a = he(s.text, i - s.from, e) + s.from, h = s.text.slice(Math.min(i, a) - s.from, Math.max(i, a) - s.from), O = o(h);
    if (l != null && O != l)
      break;
    (h != " " || i != t.head) && (l = O), i = a;
  }
  return i;
}), Tu = (n) => vu(n, !1), rS = (n) => vu(n, !0), sS = (n) => jn(n, (e) => {
  let t = n.lineBlockAt(e.head).to;
  return e.head < t ? t : Math.min(n.state.doc.length, e.head + 1);
}), oS = (n) => jn(n, (e) => {
  let t = n.moveToLineBoundary(e, !1).head;
  return e.head > t ? t : Math.max(0, e.head - 1);
}), lS = (n) => jn(n, (e) => {
  let t = n.moveToLineBoundary(e, !0).head;
  return e.head < t ? t : Math.min(n.state.doc.length, e.head + 1);
}), aS = ({ state: n, dispatch: e }) => {
  if (n.readOnly)
    return !1;
  let t = n.changeByRange((i) => ({
    changes: { from: i.from, to: i.to, insert: Y.of(["", ""]) },
    range: S.cursor(i.from)
  }));
  return e(n.update(t, { scrollIntoView: !0, userEvent: "input" })), !0;
}, hS = ({ state: n, dispatch: e }) => {
  if (n.readOnly)
    return !1;
  let t = n.changeByRange((i) => {
    if (!i.empty || i.from == 0 || i.from == n.doc.length)
      return { range: i };
    let r = i.from, s = n.doc.lineAt(r), o = r == s.from ? r - 1 : he(s.text, r - s.from, !1) + s.from, l = r == s.to ? r + 1 : he(s.text, r - s.from, !0) + s.from;
    return {
      changes: { from: o, to: l, insert: n.doc.slice(r, l).append(n.doc.slice(o, r)) },
      range: S.cursor(l)
    };
  });
  return t.changes.empty ? !1 : (e(n.update(t, { scrollIntoView: !0, userEvent: "move.character" })), !0);
};
function gs(n) {
  let e = [], t = -1;
  for (let i of n.selection.ranges) {
    let r = n.doc.lineAt(i.from), s = n.doc.lineAt(i.to);
    if (!i.empty && i.to == s.from && (s = n.doc.lineAt(i.to - 1)), t >= r.number) {
      let o = e[e.length - 1];
      o.to = s.to, o.ranges.push(i);
    } else
      e.push({ from: r.from, to: s.to, ranges: [i] });
    t = s.number + 1;
  }
  return e;
}
function Xu(n, e, t) {
  if (n.readOnly)
    return !1;
  let i = [], r = [];
  for (let s of gs(n)) {
    if (t ? s.to == n.doc.length : s.from == 0)
      continue;
    let o = n.doc.lineAt(t ? s.to + 1 : s.from - 1), l = o.length + 1;
    if (t) {
      i.push({ from: s.to, to: o.to }, { from: s.from, insert: o.text + n.lineBreak });
      for (let a of s.ranges)
        r.push(S.range(Math.min(n.doc.length, a.anchor + l), Math.min(n.doc.length, a.head + l)));
    } else {
      i.push({ from: o.from, to: s.from }, { from: s.to, insert: n.lineBreak + o.text });
      for (let a of s.ranges)
        r.push(S.range(a.anchor - l, a.head - l));
    }
  }
  return i.length ? (e(n.update({
    changes: i,
    scrollIntoView: !0,
    selection: S.create(r, n.selection.mainIndex),
    userEvent: "move.line"
  })), !0) : !1;
}
const OS = ({ state: n, dispatch: e }) => Xu(n, e, !1), cS = ({ state: n, dispatch: e }) => Xu(n, e, !0);
function Cu(n, e, t) {
  if (n.readOnly)
    return !1;
  let i = [];
  for (let s of gs(n))
    t ? i.push({ from: s.from, insert: n.doc.slice(s.from, s.to) + n.lineBreak }) : i.push({ from: s.to, insert: n.lineBreak + n.doc.slice(s.from, s.to) });
  let r = n.changes(i);
  return e(n.update({
    changes: r,
    selection: n.selection.map(r, t ? 1 : -1),
    scrollIntoView: !0,
    userEvent: "input.copyline"
  })), !0;
}
const fS = ({ state: n, dispatch: e }) => Cu(n, e, !1), uS = ({ state: n, dispatch: e }) => Cu(n, e, !0), dS = (n) => {
  if (n.state.readOnly)
    return !1;
  let { state: e } = n, t = e.changes(gs(e).map(({ from: r, to: s }) => (r > 0 ? r-- : s < e.doc.length && s++, { from: r, to: s }))), i = Ei(e.selection, (r) => {
    let s;
    if (n.lineWrapping) {
      let o = n.lineBlockAt(r.head), l = n.coordsAtPos(r.head, r.assoc || 1);
      l && (s = o.bottom + n.documentTop - l.bottom + n.defaultLineHeight / 2);
    }
    return n.moveVertically(r, !0, s);
  }).map(t);
  return n.dispatch({ changes: t, selection: i, scrollIntoView: !0, userEvent: "delete.line" }), !0;
};
function pS(n, e) {
  if (/\(\)|\[\]|\{\}/.test(n.sliceDoc(e - 1, e + 1)))
    return { from: e, to: e };
  let t = I(n).resolveInner(e), i = t.childBefore(e), r = t.childAfter(e), s;
  return i && r && i.to <= e && r.from >= e && (s = i.type.prop(q.closedBy)) && s.indexOf(r.name) > -1 && n.doc.lineAt(i.to).from == n.doc.lineAt(r.from).from && !/\S/.test(n.sliceDoc(i.to, r.from)) ? { from: i.to, to: r.from } : null;
}
const Vh = /* @__PURE__ */ Zu(!1), mS = /* @__PURE__ */ Zu(!0);
function Zu(n) {
  return ({ state: e, dispatch: t }) => {
    if (e.readOnly)
      return !1;
    let i = e.changeByRange((r) => {
      let { from: s, to: o } = r, l = e.doc.lineAt(s), a = !n && s == o && pS(e, s);
      n && (s = o = (o <= l.to ? l : e.doc.lineAt(o)).to);
      let h = new Os(e, { simulateBreak: s, simulateDoubleBreak: !!a }), O = Rf(h, s);
      for (O == null && (O = ct(/^\s*/.exec(e.doc.lineAt(s).text)[0], e.tabSize)); o < l.to && /\s/.test(l.text[o - l.from]); )
        o++;
      a ? { from: s, to: o } = a : s > l.from && s < l.from + 100 && !/\S/.test(l.text.slice(0, s)) && (s = l.from);
      let c = ["", Wr(e, O)];
      return a && c.push(Wr(e, h.lineIndent(l.from, -1))), {
        changes: { from: s, to: o, insert: Y.of(c) },
        range: S.cursor(s + 1 + c[1].length)
      };
    });
    return t(e.update(i, { scrollIntoView: !0, userEvent: "input" })), !0;
  };
}
function Yl(n, e) {
  let t = -1;
  return n.changeByRange((i) => {
    let r = [];
    for (let o = i.from; o <= i.to; ) {
      let l = n.doc.lineAt(o);
      l.number > t && (i.empty || i.to > l.from) && (e(l, r, i), t = l.number), o = l.to + 1;
    }
    let s = n.changes(r);
    return {
      changes: r,
      range: S.range(s.mapPos(i.anchor, 1), s.mapPos(i.head, 1))
    };
  });
}
const gS = ({ state: n, dispatch: e }) => {
  if (n.readOnly)
    return !1;
  let t = /* @__PURE__ */ Object.create(null), i = new Os(n, { overrideIndentation: (s) => {
    let o = t[s];
    return o ?? -1;
  } }), r = Yl(n, (s, o, l) => {
    let a = Rf(i, s.from);
    if (a == null)
      return;
    /\S/.test(s.text) || (a = 0);
    let h = /^\s*/.exec(s.text)[0], O = Wr(n, a);
    (h != O || l.from < s.from + h.length) && (t[s.from] = a, o.push({ from: s.from, to: s.from + h.length, insert: O }));
  });
  return r.changes.empty || e(n.update(r, { userEvent: "indent" })), !0;
}, Ru = ({ state: n, dispatch: e }) => n.readOnly ? !1 : (e(n.update(Yl(n, (t, i) => {
  i.push({ from: t.from, insert: n.facet(An) });
}), { userEvent: "input.indent" })), !0), Au = ({ state: n, dispatch: e }) => n.readOnly ? !1 : (e(n.update(Yl(n, (t, i) => {
  let r = /^\s*/.exec(t.text)[0];
  if (!r)
    return;
  let s = ct(r, n.tabSize), o = 0, l = Wr(n, Math.max(0, s - hi(n)));
  for (; o < r.length && o < l.length && r.charCodeAt(o) == l.charCodeAt(o); )
    o++;
  i.push({ from: t.from + o, to: t.from + r.length, insert: l.slice(o) });
}), { userEvent: "delete.dedent" })), !0), QS = (n) => (n.setTabFocusMode(), !0), SS = [
  { key: "Ctrl-b", run: au, shift: gu, preventDefault: !0 },
  { key: "Ctrl-f", run: hu, shift: Qu },
  { key: "Ctrl-p", run: fu, shift: yu },
  { key: "Ctrl-n", run: uu, shift: ku },
  { key: "Ctrl-a", run: MQ, shift: FQ },
  { key: "Ctrl-e", run: _Q, shift: HQ },
  { key: "Ctrl-d", run: wu },
  { key: "Ctrl-h", run: nl },
  { key: "Ctrl-k", run: sS },
  { key: "Ctrl-Alt-h", run: Tu },
  { key: "Ctrl-o", run: aS },
  { key: "Ctrl-t", run: hS },
  { key: "Ctrl-v", run: il }
], bS = /* @__PURE__ */ [
  { key: "ArrowLeft", run: au, shift: gu, preventDefault: !0 },
  { key: "Mod-ArrowLeft", mac: "Alt-ArrowLeft", run: XQ, shift: YQ, preventDefault: !0 },
  { mac: "Cmd-ArrowLeft", run: WQ, shift: GQ, preventDefault: !0 },
  { key: "ArrowRight", run: hu, shift: Qu, preventDefault: !0 },
  { key: "Mod-ArrowRight", mac: "Alt-ArrowRight", run: CQ, shift: VQ, preventDefault: !0 },
  { mac: "Cmd-ArrowRight", run: zQ, shift: NQ, preventDefault: !0 },
  { key: "ArrowUp", run: fu, shift: yu, preventDefault: !0 },
  { mac: "Cmd-ArrowUp", run: _h, shift: Lh },
  { mac: "Ctrl-ArrowUp", run: Wh, shift: zh },
  { key: "ArrowDown", run: uu, shift: ku, preventDefault: !0 },
  { mac: "Cmd-ArrowDown", run: Eh, shift: Yh },
  { mac: "Ctrl-ArrowDown", run: il, shift: Mh },
  { key: "PageUp", run: Wh, shift: zh },
  { key: "PageDown", run: il, shift: Mh },
  { key: "Home", run: jQ, shift: IQ, preventDefault: !0 },
  { key: "Mod-Home", run: _h, shift: Lh },
  { key: "End", run: qQ, shift: BQ, preventDefault: !0 },
  { key: "Mod-End", run: Eh, shift: Yh },
  { key: "Enter", run: Vh, shift: Vh },
  { key: "Mod-a", run: KQ },
  { key: "Backspace", run: nl, shift: nl, preventDefault: !0 },
  { key: "Delete", run: wu, preventDefault: !0 },
  { key: "Mod-Backspace", mac: "Alt-Backspace", run: Tu, preventDefault: !0 },
  { key: "Mod-Delete", mac: "Alt-Delete", run: rS, preventDefault: !0 },
  { mac: "Mod-Backspace", run: oS, preventDefault: !0 },
  { mac: "Mod-Delete", run: lS, preventDefault: !0 }
].concat(/* @__PURE__ */ SS.map((n) => ({ mac: n.key, run: n.run, shift: n.shift }))), zx = /* @__PURE__ */ [
  { key: "Alt-ArrowLeft", mac: "Ctrl-ArrowLeft", run: RQ, shift: UQ },
  { key: "Alt-ArrowRight", mac: "Ctrl-ArrowRight", run: AQ, shift: DQ },
  { key: "Alt-ArrowUp", run: OS },
  { key: "Shift-Alt-ArrowUp", run: fS },
  { key: "Alt-ArrowDown", run: cS },
  { key: "Shift-Alt-ArrowDown", run: uS },
  { key: "Mod-Alt-ArrowUp", run: tS },
  { key: "Mod-Alt-ArrowDown", run: iS },
  { key: "Escape", run: nS },
  { key: "Mod-Enter", run: mS },
  { key: "Alt-l", mac: "Ctrl-l", run: JQ },
  { key: "Mod-i", run: eS, preventDefault: !0 },
  { key: "Mod-[", run: Au },
  { key: "Mod-]", run: Ru },
  { key: "Mod-Alt-\\", run: gS },
  { key: "Shift-Mod-k", run: dS },
  { key: "Shift-Mod-\\", run: LQ },
  { key: "Mod-/", run: fQ },
  { key: "Alt-A", mac: "Ctrl-A", run: dQ },
  { key: "Ctrl-m", mac: "Shift-Alt-m", run: QS }
].concat(bS), Mx = { key: "Tab", run: Ru, shift: Au }, Uh = typeof String.prototype.normalize == "function" ? (n) => n.normalize("NFKD") : (n) => n;
class Wi {
  /**
  Create a text cursor. The query is the search string, `from` to
  `to` provides the region to search.
  
  When `normalize` is given, it will be called, on both the query
  string and the content it is matched against, before comparing.
  You can, for example, create a case-insensitive search by
  passing `s => s.toLowerCase()`.
  
  Text is always normalized with
  [`.normalize("NFKD")`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize)
  (when supported).
  */
  constructor(e, t, i = 0, r = e.length, s, o) {
    this.test = o, this.value = { from: 0, to: 0, precise: !1 }, this.done = !1, this.matches = [], this.buffer = "", this.bufferPos = 0, this.iter = e.iterRange(i, r), this.bufferStart = i, this.normalize = s ? (l) => s(Uh(l)) : Uh, this.query = this.normalize(t);
  }
  peek() {
    if (this.bufferPos == this.buffer.length) {
      if (this.bufferStart += this.buffer.length, this.iter.next(), this.iter.done)
        return -1;
      this.bufferPos = 0, this.buffer = this.iter.value;
    }
    return Ae(this.buffer, this.bufferPos);
  }
  /**
  Look for the next match. Updates the iterator's
  [`value`](https://codemirror.net/6/docs/ref/#search.SearchCursor.value) and
  [`done`](https://codemirror.net/6/docs/ref/#search.SearchCursor.done) properties. Should be called
  at least once before using the cursor.
  */
  next() {
    for (; this.matches.length; )
      this.matches.pop();
    return this.nextOverlapping();
  }
  /**
  The `next` method will ignore matches that partially overlap a
  previous match. This method behaves like `next`, but includes
  such matches.
  */
  nextOverlapping() {
    for (; ; ) {
      let e = this.peek();
      if (e < 0)
        return this.done = !0, this;
      let t = pl(e), i = this.bufferStart + this.bufferPos;
      this.bufferPos += nt(e);
      let r = this.normalize(t);
      if (r.length)
        for (let s = 0, o = i, l = !0; ; s++) {
          let a = r.charCodeAt(s), h = this.match(a, o, l, this.bufferPos + this.bufferStart, s == r.length - 1);
          if (h)
            return this.value = h, this;
          if (s == r.length - 1)
            break;
          l && s < t.length && t.charCodeAt(s) == a ? o++ : l = !1;
        }
    }
  }
  match(e, t, i, r, s) {
    let o = null;
    for (let l = 0; l < this.matches.length; ) {
      let a = this.matches[l], h = !1;
      this.query.charCodeAt(a.index) == e && (a.index == this.query.length - 1 ? o = { from: a.from, to: r, precise: s && a.precise } : (a.index++, h = !0)), h ? l++ : this.matches.splice(l, 1);
    }
    return this.query.charCodeAt(0) == e && (this.query.length == 1 ? o = { from: t, to: r, precise: i && s } : this.matches.push({ from: t, index: 1, precise: i })), o && this.test && !this.test(o.from, o.to, this.buffer, this.bufferStart) && (o = null), o;
  }
}
typeof Symbol < "u" && (Wi.prototype[Symbol.iterator] = function() {
  return this;
});
const qu = { from: -1, to: -1, match: /* @__PURE__ */ /.*/.exec(""), precise: !0 }, Vl = "gm" + (/x/.unicode == null ? "" : "u");
class ju {
  /**
  Create a cursor that will search the given range in the given
  document. `query` should be the raw pattern (as you'd pass it to
  `new RegExp`).
  */
  constructor(e, t, i, r = 0, s = e.length) {
    if (this.text = e, this.to = s, this.curLine = "", this.done = !1, this.value = qu, /\\[sWDnr]|\n|\r|\[\^/.test(t))
      return new Wu(e, t, i, r, s);
    this.re = new RegExp(t, Vl + (i?.ignoreCase ? "i" : "")), this.test = i?.test, this.iter = e.iter();
    let o = e.lineAt(r);
    this.curLineStart = o.from, this.matchPos = Er(e, r), this.getLine(this.curLineStart);
  }
  getLine(e) {
    this.iter.next(e), this.iter.lineBreak ? this.curLine = "" : (this.curLine = this.iter.value, this.curLineStart + this.curLine.length > this.to && (this.curLine = this.curLine.slice(0, this.to - this.curLineStart)), this.iter.next());
  }
  nextLine() {
    this.curLineStart = this.curLineStart + this.curLine.length + 1, this.curLineStart > this.to ? this.curLine = "" : this.getLine(0);
  }
  /**
  Move to the next match, if there is one.
  */
  next() {
    for (let e = this.matchPos - this.curLineStart; ; ) {
      this.re.lastIndex = e;
      let t = this.matchPos <= this.to && this.re.exec(this.curLine);
      if (t) {
        let i = this.curLineStart + t.index, r = i + t[0].length;
        if (this.matchPos = Er(this.text, r + (i == r ? 1 : 0)), i == this.curLineStart + this.curLine.length && this.nextLine(), (i < r || i > this.value.to) && (!this.test || this.test(i, r, t)))
          return this.value = { from: i, to: r, precise: !0, match: t }, this;
        e = this.matchPos - this.curLineStart;
      } else if (this.curLineStart + this.curLine.length < this.to)
        this.nextLine(), e = 0;
      else
        return this.done = !0, this;
    }
  }
}
const Ys = /* @__PURE__ */ new WeakMap();
class vi {
  constructor(e, t) {
    this.from = e, this.text = t;
  }
  get to() {
    return this.from + this.text.length;
  }
  static get(e, t, i) {
    let r = Ys.get(e);
    if (!r || r.from >= i || r.to <= t) {
      let l = new vi(t, e.sliceString(t, i));
      return Ys.set(e, l), l;
    }
    if (r.from == t && r.to == i)
      return r;
    let { text: s, from: o } = r;
    return o > t && (s = e.sliceString(t, o) + s, o = t), r.to < i && (s += e.sliceString(r.to, i)), Ys.set(e, new vi(o, s)), new vi(t, s.slice(t - o, i - o));
  }
}
class Wu {
  constructor(e, t, i, r, s) {
    this.text = e, this.to = s, this.done = !1, this.value = qu, this.matchPos = Er(e, r), this.re = new RegExp(t, Vl + (i?.ignoreCase ? "i" : "")), this.test = i?.test, this.flat = vi.get(e, r, this.chunkEnd(
      r + 5e3
      /* Chunk.Base */
    ));
  }
  chunkEnd(e) {
    return e >= this.to ? this.to : this.text.lineAt(e).to;
  }
  next() {
    for (; ; ) {
      let e = this.re.lastIndex = this.matchPos - this.flat.from, t = this.re.exec(this.flat.text);
      if (t && !t[0] && t.index == e && (this.re.lastIndex = e + 1, t = this.re.exec(this.flat.text)), t) {
        let i = this.flat.from + t.index, r = i + t[0].length;
        if ((this.flat.to >= this.to || t.index + t[0].length <= this.flat.text.length - 10) && (!this.test || this.test(i, r, t)))
          return this.value = { from: i, to: r, precise: !0, match: t }, this.matchPos = Er(this.text, r + (i == r ? 1 : 0)), this;
      }
      if (this.flat.to == this.to)
        return this.done = !0, this;
      this.flat = vi.get(this.text, this.flat.from, this.chunkEnd(this.flat.from + this.flat.text.length * 2));
    }
  }
}
typeof Symbol < "u" && (ju.prototype[Symbol.iterator] = Wu.prototype[Symbol.iterator] = function() {
  return this;
});
function yS(n) {
  try {
    return new RegExp(n, Vl), !0;
  } catch {
    return !1;
  }
}
function Er(n, e) {
  if (e >= n.length)
    return e;
  let t = n.lineAt(e), i;
  for (; e < t.to && (i = t.text.charCodeAt(e - t.from)) >= 56320 && i < 57344; )
    e++;
  return e;
}
const kS = (n) => {
  let e = Gg(n, "cm-goto-line");
  if (e) {
    let o = e.dom.querySelector("input[type=text]");
    return o && o.select(), !0;
  }
  let { state: t } = n, i = String(t.doc.lineAt(n.state.selection.main.head).number), { close: r, result: s } = Ig(n, {
    class: "cm-goto-line",
    label: t.phrase("Go to line"),
    input: { type: "text", name: "line", value: i },
    focus: !0,
    submitLabel: t.phrase("go")
  });
  return s.then((o) => {
    let l = o && /^([+-])?(\d+)?(:\d+)?(%)?$/.exec(o.elements.line.value);
    if (!l) {
      n.dispatch({ effects: r });
      return;
    }
    let a = t.doc.lineAt(t.selection.main.head), [, h, O, c, f] = l, u = c ? +c.slice(1) : 0, d = O ? +O : a.number;
    if (O && f) {
      let Q = d / 100;
      h && (Q = Q * (h == "-" ? -1 : 1) + a.number / t.doc.lines), d = Math.round(t.doc.lines * Q);
    } else O && h && (d = d * (h == "-" ? -1 : 1) + a.number);
    let p = t.doc.line(Math.max(1, Math.min(t.doc.lines, d))), g = S.cursor(p.from + Math.max(0, Math.min(u, p.length)));
    n.dispatch({
      effects: [r, T.scrollIntoView(g.from, { y: "center" })],
      selection: g
    });
  }), !0;
}, $S = {
  highlightWordAroundCursor: !1,
  minSelectionLength: 1,
  maxMatches: 100,
  wholeWords: !1
}, zu = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, $S, {
      highlightWordAroundCursor: (e, t) => e || t,
      minSelectionLength: Math.min,
      maxMatches: Math.min
    });
  }
});
function _x(n) {
  let e = [TS, vS];
  return n && e.push(zu.of(n)), e;
}
const xS = /* @__PURE__ */ A.mark({ class: "cm-selectionMatch" }), PS = /* @__PURE__ */ A.mark({ class: "cm-selectionMatch cm-selectionMatch-main" });
function Dh(n, e, t, i) {
  return (t == 0 || n(e.sliceDoc(t - 1, t)) != J.Word) && (i == e.doc.length || n(e.sliceDoc(i, i + 1)) != J.Word);
}
function wS(n, e, t, i) {
  return n(e.sliceDoc(t, t + 1)) == J.Word && n(e.sliceDoc(i - 1, i)) == J.Word;
}
const vS = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.decorations = this.getDeco(n);
  }
  update(n) {
    (n.selectionSet || n.docChanged || n.viewportChanged) && (this.decorations = this.getDeco(n.view));
  }
  getDeco(n) {
    let e = n.state.facet(zu), { state: t } = n, i = t.selection;
    if (i.ranges.length > 1)
      return A.none;
    let r = i.main, s, o = null;
    if (r.empty) {
      if (!e.highlightWordAroundCursor)
        return A.none;
      let a = t.wordAt(r.head);
      if (!a)
        return A.none;
      o = t.charCategorizer(r.head), s = t.sliceDoc(a.from, a.to);
    } else {
      let a = r.to - r.from;
      if (a < e.minSelectionLength || a > 200)
        return A.none;
      if (e.wholeWords) {
        if (s = t.sliceDoc(r.from, r.to), o = t.charCategorizer(r.head), !(Dh(o, t, r.from, r.to) && wS(o, t, r.from, r.to)))
          return A.none;
      } else if (s = t.sliceDoc(r.from, r.to), !s)
        return A.none;
    }
    let l = [];
    for (let a of n.visibleRanges) {
      let h = new Wi(t.doc, s, a.from, a.to);
      for (; !h.next().done; ) {
        let { from: O, to: c } = h.value;
        if ((!o || Dh(o, t, O, c)) && (r.empty && O <= r.from && c >= r.to ? l.push(PS.range(O, c)) : (O >= r.to || c <= r.from) && l.push(xS.range(O, c)), l.length > e.maxMatches))
          return A.none;
      }
    }
    return A.set(l);
  }
}, {
  decorations: (n) => n.decorations
}), TS = /* @__PURE__ */ T.baseTheme({
  ".cm-selectionMatch": { backgroundColor: "#99ff7780" },
  ".cm-searchMatch .cm-selectionMatch": { backgroundColor: "transparent" }
}), XS = ({ state: n, dispatch: e }) => {
  let { selection: t } = n, i = S.create(t.ranges.map((r) => n.wordAt(r.head) || S.cursor(r.head)), t.mainIndex);
  return i.eq(t) ? !1 : (e(n.update({ selection: i })), !0);
};
function CS(n, e) {
  let { main: t, ranges: i } = n.selection, r = n.wordAt(t.head), s = r && r.from == t.from && r.to == t.to;
  for (let o = !1, l = new Wi(n.doc, e, i[i.length - 1].to); ; )
    if (l.next(), l.done) {
      if (o)
        return null;
      l = new Wi(n.doc, e, 0, Math.max(0, i[i.length - 1].from - 1)), o = !0;
    } else {
      if (o && i.some((a) => a.from == l.value.from))
        continue;
      if (s) {
        let a = n.wordAt(l.value.from);
        if (!a || a.from != l.value.from || a.to != l.value.to)
          continue;
      }
      return l.value;
    }
}
const ZS = ({ state: n, dispatch: e }) => {
  let { ranges: t } = n.selection;
  if (t.some((s) => s.from === s.to))
    return XS({ state: n, dispatch: e });
  let i = n.sliceDoc(t[0].from, t[0].to);
  if (n.selection.ranges.some((s) => n.sliceDoc(s.from, s.to) != i))
    return !1;
  let r = CS(n, i);
  return r ? (e(n.update({
    selection: n.selection.addRange(S.range(r.from, r.to), !1),
    effects: T.scrollIntoView(r.to)
  })), !0) : !1;
}, Li = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, {
      top: !1,
      caseSensitive: !1,
      literal: !1,
      regexp: !1,
      wholeWord: !1,
      createPanel: (e) => new US(e),
      scrollToMatch: (e) => T.scrollIntoView(e)
    });
  }
});
class Mu {
  /**
  Create a query object.
  */
  constructor(e) {
    this.search = e.search, this.caseSensitive = !!e.caseSensitive, this.literal = !!e.literal, this.regexp = !!e.regexp, this.replace = e.replace || "", this.valid = !!this.search && (!this.regexp || yS(this.search)), this.unquoted = this.unquote(this.search), this.wholeWord = !!e.wholeWord, this.test = e.test;
  }
  /**
  @internal
  */
  unquote(e) {
    return this.literal ? e : e.replace(/\\([nrt\\])/g, (t, i) => i == "n" ? `
` : i == "r" ? "\r" : i == "t" ? "	" : "\\");
  }
  /**
  Compare this query to another query.
  */
  eq(e) {
    return this.search == e.search && this.replace == e.replace && this.caseSensitive == e.caseSensitive && this.regexp == e.regexp && this.wholeWord == e.wholeWord && this.test == e.test;
  }
  /**
  @internal
  */
  create() {
    return this.regexp ? new zS(this) : new qS(this);
  }
  /**
  Get a search cursor for this query, searching through the given
  range in the given state.
  */
  getCursor(e, t = 0, i) {
    let r = e.doc ? e : D.create({ doc: e });
    return i == null && (i = r.doc.length), this.regexp ? gi(this, r, t, i) : mi(this, r, t, i);
  }
}
class _u {
  constructor(e) {
    this.spec = e;
  }
}
function RS(n, e, t) {
  return (i, r, s, o) => {
    if (t && !t(i, r, s, o))
      return !1;
    let l = i >= o && r <= o + s.length ? s.slice(i - o, r - o) : e.doc.sliceString(i, r);
    return n(l, e, i, r);
  };
}
function mi(n, e, t, i) {
  let r;
  return n.wholeWord && (r = AS(e.doc, e.charCategorizer(e.selection.main.head))), n.test && (r = RS(n.test, e, r)), new Wi(e.doc, n.unquoted, t, i, n.caseSensitive ? void 0 : (s) => s.toLowerCase(), r);
}
function AS(n, e) {
  return (t, i, r, s) => ((s > t || s + r.length < i) && (s = Math.max(0, t - 2), r = n.sliceString(s, Math.min(n.length, i + 2))), (e(Lr(r, t - s)) != J.Word || e(Yr(r, t - s)) != J.Word) && (e(Yr(r, i - s)) != J.Word || e(Lr(r, i - s)) != J.Word));
}
class qS extends _u {
  constructor(e) {
    super(e);
  }
  nextMatch(e, t, i) {
    let r = mi(this.spec, e, i, e.doc.length).nextOverlapping();
    if (r.done) {
      let s = Math.min(e.doc.length, t + this.spec.unquoted.length);
      r = mi(this.spec, e, 0, s).nextOverlapping();
    }
    return r.done || r.value.from == t && r.value.to == i ? null : r.value;
  }
  // Searching in reverse is, rather than implementing an inverted search
  // cursor, done by scanning chunk after chunk forward.
  prevMatchInRange(e, t, i) {
    for (let r = i; ; ) {
      let s = Math.max(t, r - 1e4 - this.spec.unquoted.length), o = mi(this.spec, e, s, r), l = null;
      for (; !o.nextOverlapping().done; )
        l = o.value;
      if (l)
        return l;
      if (s == t)
        return null;
      r -= 1e4;
    }
  }
  prevMatch(e, t, i) {
    let r = this.prevMatchInRange(e, 0, t);
    return r || (r = this.prevMatchInRange(e, Math.max(0, i - this.spec.unquoted.length), e.doc.length)), r && (r.from != t || r.to != i) ? r : null;
  }
  getReplacement(e) {
    return this.spec.unquote(this.spec.replace);
  }
  matchAll(e, t) {
    let i = mi(this.spec, e, 0, e.doc.length), r = [];
    for (; !i.next().done; ) {
      if (r.length >= t)
        return null;
      r.push(i.value);
    }
    return r;
  }
  highlight(e, t, i, r) {
    let s = mi(this.spec, e, Math.max(0, t - this.spec.unquoted.length), Math.min(i + this.spec.unquoted.length, e.doc.length));
    for (; !s.next().done; )
      r(s.value.from, s.value.to);
  }
}
function jS(n, e, t) {
  return (i, r, s) => (!t || t(i, r, s)) && n(s[0], e, i, r);
}
function gi(n, e, t, i) {
  let r;
  return n.wholeWord && (r = WS(e.charCategorizer(e.selection.main.head))), n.test && (r = jS(n.test, e, r)), new ju(e.doc, n.search, { ignoreCase: !n.caseSensitive, test: r }, t, i);
}
function Lr(n, e) {
  return n.slice(he(n, e, !1), e);
}
function Yr(n, e) {
  return n.slice(e, he(n, e));
}
function WS(n) {
  return (e, t, i) => !i[0].length || (n(Lr(i.input, i.index)) != J.Word || n(Yr(i.input, i.index)) != J.Word) && (n(Yr(i.input, i.index + i[0].length)) != J.Word || n(Lr(i.input, i.index + i[0].length)) != J.Word);
}
class zS extends _u {
  nextMatch(e, t, i) {
    let r = gi(this.spec, e, i, e.doc.length).next();
    return r.done && (r = gi(this.spec, e, 0, t).next()), r.done ? null : r.value;
  }
  prevMatchInRange(e, t, i) {
    for (let r = 1; ; r++) {
      let s = Math.max(
        t,
        i - r * 1e4
        /* FindPrev.ChunkSize */
      ), o = gi(this.spec, e, s, i), l = null;
      for (; !o.next().done; )
        l = o.value;
      if (l && (s == t || l.from > s + 10))
        return l;
      if (s == t)
        return null;
    }
  }
  prevMatch(e, t, i) {
    return this.prevMatchInRange(e, 0, t) || this.prevMatchInRange(e, i, e.doc.length);
  }
  getReplacement(e) {
    return this.spec.unquote(this.spec.replace).replace(/\$([$&]|\d+)/g, (t, i) => {
      if (i == "&")
        return e.match[0];
      if (i == "$")
        return "$";
      for (let r = i.length; r > 0; r--) {
        let s = +i.slice(0, r);
        if (s > 0 && s < e.match.length)
          return e.match[s] + i.slice(r);
      }
      return t;
    });
  }
  matchAll(e, t) {
    let i = gi(this.spec, e, 0, e.doc.length), r = [];
    for (; !i.next().done; ) {
      if (r.length >= t)
        return null;
      r.push(i.value);
    }
    return r;
  }
  highlight(e, t, i, r) {
    let s = gi(this.spec, e, Math.max(
      0,
      t - 250
      /* RegExp.HighlightMargin */
    ), Math.min(i + 250, e.doc.length));
    for (; !s.next().done; )
      r(s.value.from, s.value.to);
  }
}
const yn = /* @__PURE__ */ W.define(), Ul = /* @__PURE__ */ W.define(), qt = /* @__PURE__ */ $e.define({
  create(n) {
    return new Vs(rl(n).create(), null);
  },
  update(n, e) {
    for (let t of e.effects)
      t.is(yn) ? n = new Vs(t.value.create(), n.panel) : t.is(Ul) && (n = new Vs(n.query, t.value ? Dl : null));
    return n;
  },
  provide: (n) => Rr.from(n, (e) => e.panel)
});
class Vs {
  constructor(e, t) {
    this.query = e, this.panel = t;
  }
}
const MS = /* @__PURE__ */ A.mark({ class: "cm-searchMatch" }), _S = /* @__PURE__ */ A.mark({ class: "cm-searchMatch cm-searchMatch-selected" }), ES = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.view = n, this.decorations = this.highlight(n.state.field(qt));
  }
  update(n) {
    let e = n.state.field(qt);
    (e != n.startState.field(qt) || n.docChanged || n.selectionSet || n.viewportChanged) && (this.decorations = this.highlight(e));
  }
  highlight({ query: n, panel: e }) {
    if (!e || !n.spec.valid)
      return A.none;
    let { view: t } = this, i = new At();
    for (let r = 0, s = t.visibleRanges, o = s.length; r < o; r++) {
      let { from: l, to: a } = s[r];
      for (; r < o - 1 && a > s[r + 1].from - 2 * 250; )
        a = s[++r].to;
      n.highlight(t.state, l, a, (h, O) => {
        let c = t.state.selection.ranges.some((f) => f.from == h && f.to == O);
        i.add(h, O, c ? _S : MS);
      });
    }
    return i.finish();
  }
}, {
  decorations: (n) => n.decorations
});
function Wn(n) {
  return (e) => {
    let t = e.state.field(qt, !1);
    return t && t.query.spec.valid ? n(e, t) : Yu(e);
  };
}
const Vr = /* @__PURE__ */ Wn((n, { query: e }) => {
  let { to: t } = n.state.selection.main, i = e.nextMatch(n.state, t, t);
  if (!i)
    return !1;
  let r = S.single(i.from, i.to), s = n.state.facet(Li);
  return n.dispatch({
    selection: r,
    effects: [Bl(n, i), s.scrollToMatch(r.main, n)],
    userEvent: "select.search"
  }), Lu(n), !0;
}), Ur = /* @__PURE__ */ Wn((n, { query: e }) => {
  let { state: t } = n, { from: i } = t.selection.main, r = e.prevMatch(t, i, i);
  if (!r)
    return !1;
  let s = S.single(r.from, r.to), o = n.state.facet(Li);
  return n.dispatch({
    selection: s,
    effects: [Bl(n, r), o.scrollToMatch(s.main, n)],
    userEvent: "select.search"
  }), Lu(n), !0;
}), LS = /* @__PURE__ */ Wn((n, { query: e }) => {
  let t = e.matchAll(n.state, 1e3);
  return !t || !t.length ? !1 : (n.dispatch({
    selection: S.create(t.map((i) => S.range(i.from, i.to))),
    userEvent: "select.search.matches"
  }), !0);
}), YS = ({ state: n, dispatch: e }) => {
  let t = n.selection;
  if (t.ranges.length > 1 || t.main.empty)
    return !1;
  let { from: i, to: r } = t.main, s = [], o = 0;
  for (let l = new Wi(n.doc, n.sliceDoc(i, r)); !l.next().done; ) {
    if (s.length > 1e3)
      return !1;
    l.value.from == i && (o = s.length), s.push(S.range(l.value.from, l.value.to));
  }
  return e(n.update({
    selection: S.create(s, o),
    userEvent: "select.search.matches"
  })), !0;
}, Bh = /* @__PURE__ */ Wn((n, { query: e }) => {
  let { state: t } = n, { from: i, to: r } = t.selection.main;
  if (t.readOnly)
    return !1;
  let s = e.nextMatch(t, i, i);
  if (!s)
    return !1;
  let o = s, l = [], a, h, O = [];
  o.precise ? o.from == i && o.to == r && (h = t.toText(e.getReplacement(o)), l.push({ from: o.from, to: o.to, insert: h }), o = e.nextMatch(t, o.from, o.to), O.push(T.announce.of(t.phrase("replaced match on line $", t.doc.lineAt(i).number) + "."))) : o = e.nextMatch(t, o.from, o.to);
  let c = n.state.changes(l);
  return o && (a = S.single(o.from, o.to).map(c), O.push(Bl(n, o)), O.push(t.facet(Li).scrollToMatch(a.main, n))), n.dispatch({
    changes: c,
    selection: a,
    effects: O,
    userEvent: "input.replace"
  }), !0;
}), VS = /* @__PURE__ */ Wn((n, { query: e }) => {
  if (n.state.readOnly)
    return !1;
  let t = [];
  for (let r of e.matchAll(n.state, 1e9)) {
    let { from: s, to: o, precise: l } = r;
    l && t.push({ from: s, to: o, insert: e.getReplacement(r) });
  }
  if (!t.length)
    return !1;
  let i = n.state.phrase("replaced $ matches", t.length) + ".";
  return n.dispatch({
    changes: t,
    effects: T.announce.of(i),
    userEvent: "input.replace.all"
  }), !0;
});
function Dl(n) {
  return n.state.facet(Li).createPanel(n);
}
function rl(n, e) {
  var t, i, r, s, o;
  let l = n.selection.main, a = l.empty || l.to > l.from + 100 ? "" : n.sliceDoc(l.from, l.to);
  if (e && !a)
    return e;
  let h = n.facet(Li);
  return new Mu({
    search: ((t = e?.literal) !== null && t !== void 0 ? t : h.literal) ? a : a.replace(/\n/g, "\\n"),
    caseSensitive: (i = e?.caseSensitive) !== null && i !== void 0 ? i : h.caseSensitive,
    literal: (r = e?.literal) !== null && r !== void 0 ? r : h.literal,
    regexp: (s = e?.regexp) !== null && s !== void 0 ? s : h.regexp,
    wholeWord: (o = e?.wholeWord) !== null && o !== void 0 ? o : h.wholeWord
  });
}
function Eu(n) {
  let e = Zl(n, Dl);
  return e && e.dom.querySelector("[main-field]");
}
function Lu(n) {
  let e = Eu(n);
  e && e == n.root.activeElement && e.select();
}
const Yu = (n) => {
  let e = n.state.field(qt, !1);
  if (e && e.panel) {
    let t = Eu(n);
    if (t && t != n.root.activeElement) {
      let i = rl(n.state, e.query.spec);
      i.valid && n.dispatch({ effects: yn.of(i) }), t.focus(), t.select();
    }
  } else
    n.dispatch({ effects: [
      Ul.of(!0),
      e ? yn.of(rl(n.state, e.query.spec)) : W.appendConfig.of(BS)
    ] });
  return !0;
}, Vu = (n) => {
  let e = n.state.field(qt, !1);
  if (!e || !e.panel)
    return !1;
  let t = Zl(n, Dl);
  return t && t.dom.contains(n.root.activeElement) && n.focus(), n.dispatch({ effects: Ul.of(!1) }), !0;
}, Ex = [
  { key: "Mod-f", run: Yu, scope: "editor search-panel" },
  { key: "F3", run: Vr, shift: Ur, scope: "editor search-panel", preventDefault: !0 },
  { key: "Mod-g", run: Vr, shift: Ur, scope: "editor search-panel", preventDefault: !0 },
  { key: "Escape", run: Vu, scope: "editor search-panel" },
  { key: "Mod-Shift-l", run: YS },
  { key: "Mod-Alt-g", run: kS },
  { key: "Mod-d", run: ZS, preventDefault: !0 }
];
class US {
  constructor(e) {
    this.view = e;
    let t = this.query = e.state.field(qt).query.spec;
    this.commit = this.commit.bind(this), this.searchField = le("input", {
      value: t.search,
      placeholder: Te(e, "Find"),
      "aria-label": Te(e, "Find"),
      class: "cm-textfield",
      name: "search",
      form: "",
      "main-field": "true",
      onchange: this.commit,
      onkeyup: this.commit
    }), this.replaceField = le("input", {
      value: t.replace,
      placeholder: Te(e, "Replace"),
      "aria-label": Te(e, "Replace"),
      class: "cm-textfield",
      name: "replace",
      form: "",
      onchange: this.commit,
      onkeyup: this.commit
    }), this.caseField = le("input", {
      type: "checkbox",
      name: "case",
      form: "",
      checked: t.caseSensitive,
      onchange: this.commit
    }), this.reField = le("input", {
      type: "checkbox",
      name: "re",
      form: "",
      checked: t.regexp,
      onchange: this.commit
    }), this.wordField = le("input", {
      type: "checkbox",
      name: "word",
      form: "",
      checked: t.wholeWord,
      onchange: this.commit
    });
    function i(r, s, o) {
      return le("button", { class: "cm-button", name: r, onclick: s, type: "button" }, o);
    }
    this.dom = le("div", { onkeydown: (r) => this.keydown(r), class: "cm-search" }, [
      this.searchField,
      i("next", () => Vr(e), [Te(e, "next")]),
      i("prev", () => Ur(e), [Te(e, "previous")]),
      i("select", () => LS(e), [Te(e, "all")]),
      le("label", null, [this.caseField, Te(e, "match case")]),
      le("label", null, [this.reField, Te(e, "regexp")]),
      le("label", null, [this.wordField, Te(e, "by word")]),
      ...e.state.readOnly ? [] : [
        le("br"),
        this.replaceField,
        i("replace", () => Bh(e), [Te(e, "replace")]),
        i("replaceAll", () => VS(e), [Te(e, "replace all")])
      ],
      le("button", {
        name: "close",
        onclick: () => Vu(e),
        "aria-label": Te(e, "close"),
        type: "button"
      }, ["×"])
    ]);
  }
  commit() {
    let e = new Mu({
      search: this.searchField.value,
      caseSensitive: this.caseField.checked,
      regexp: this.reField.checked,
      wholeWord: this.wordField.checked,
      replace: this.replaceField.value
    });
    e.eq(this.query) || (this.query = e, this.view.dispatch({ effects: yn.of(e) }));
  }
  keydown(e) {
    xg(this.view, e, "search-panel") ? e.preventDefault() : e.keyCode == 13 && e.target == this.searchField ? (e.preventDefault(), (e.shiftKey ? Ur : Vr)(this.view)) : e.keyCode == 13 && e.target == this.replaceField && (e.preventDefault(), Bh(this.view));
  }
  update(e) {
    for (let t of e.transactions)
      for (let i of t.effects)
        i.is(yn) && !i.value.eq(this.query) && this.setQuery(i.value);
  }
  setQuery(e) {
    this.query = e, this.searchField.value = e.search, this.replaceField.value = e.replace, this.caseField.checked = e.caseSensitive, this.reField.checked = e.regexp, this.wordField.checked = e.wholeWord;
  }
  mount() {
    this.searchField.select();
  }
  get pos() {
    return 80;
  }
  get top() {
    return this.view.state.facet(Li).top;
  }
}
function Te(n, e) {
  return n.state.phrase(e);
}
const nr = 30, rr = /[\s\.,:;?!]/;
function Bl(n, { from: e, to: t }) {
  let i = n.state.doc.lineAt(e), r = n.state.doc.lineAt(t).to, s = Math.max(i.from, e - nr), o = Math.min(r, t + nr), l = n.state.sliceDoc(s, o);
  if (s != i.from) {
    for (let a = 0; a < nr; a++)
      if (!rr.test(l[a + 1]) && rr.test(l[a])) {
        l = l.slice(a);
        break;
      }
  }
  if (o != r) {
    for (let a = l.length - 1; a > l.length - nr; a--)
      if (!rr.test(l[a - 1]) && rr.test(l[a])) {
        l = l.slice(0, a);
        break;
      }
  }
  return T.announce.of(`${n.state.phrase("current match")}. ${l} ${n.state.phrase("on line")} ${i.number}.`);
}
const DS = /* @__PURE__ */ T.baseTheme({
  ".cm-panel.cm-search": {
    padding: "2px 6px 4px",
    position: "relative",
    "& [name=close]": {
      position: "absolute",
      top: "0",
      right: "4px",
      backgroundColor: "inherit",
      border: "none",
      font: "inherit",
      padding: 0,
      margin: 0
    },
    "& input, & button, & label": {
      margin: ".2em .6em .2em 0"
    },
    "& input[type=checkbox]": {
      marginRight: ".2em"
    },
    "& label": {
      fontSize: "80%",
      whiteSpace: "pre"
    }
  },
  "&light .cm-searchMatch": { backgroundColor: "#ffff0054" },
  "&dark .cm-searchMatch": { backgroundColor: "#00ffff8a" },
  "&light .cm-searchMatch-selected": { backgroundColor: "#ff6a0054" },
  "&dark .cm-searchMatch-selected": { backgroundColor: "#ff00ff8a" }
}), BS = [
  qt,
  /* @__PURE__ */ xt.low(ES),
  DS
];
class Il {
  /**
  Create a new completion context. (Mostly useful for testing
  completion sources—in the editor, the extension will create
  these for you.)
  */
  constructor(e, t, i, r) {
    this.state = e, this.pos = t, this.explicit = i, this.view = r, this.abortListeners = [], this.abortOnDocChange = !1;
  }
  /**
  Get the extent, content, and (if there is a token) type of the
  token before `this.pos`.
  */
  tokenBefore(e) {
    let t = I(this.state).resolveInner(this.pos, -1);
    for (; t && e.indexOf(t.name) < 0; )
      t = t.parent;
    return t ? {
      from: t.from,
      to: this.pos,
      text: this.state.sliceDoc(t.from, this.pos),
      type: t.type
    } : null;
  }
  /**
  Get the match of the given expression directly before the
  cursor.
  */
  matchBefore(e) {
    let t = this.state.doc.lineAt(this.pos), i = Math.max(t.from, this.pos - 250), r = t.text.slice(i - t.from, this.pos - t.from), s = r.search(Du(e, !1));
    return s < 0 ? null : { from: i + s, to: this.pos, text: r.slice(s) };
  }
  /**
  Yields true when the query has been aborted. Can be useful in
  asynchronous queries to avoid doing work that will be ignored.
  */
  get aborted() {
    return this.abortListeners == null;
  }
  /**
  Allows you to register abort handlers, which will be called when
  the query is
  [aborted](https://codemirror.net/6/docs/ref/#autocomplete.CompletionContext.aborted).
  
  By default, running queries will not be aborted for regular
  typing or backspacing, on the assumption that they are likely to
  return a result with a
  [`validFor`](https://codemirror.net/6/docs/ref/#autocomplete.CompletionResult.validFor) field that
  allows the result to be used after all. Passing `onDocChange:
  true` will cause this query to be aborted for any document
  change.
  */
  addEventListener(e, t, i) {
    e == "abort" && this.abortListeners && (this.abortListeners.push(t), i && i.onDocChange && (this.abortOnDocChange = !0));
  }
}
function Ih(n) {
  let e = Object.keys(n).join(""), t = /\w/.test(e);
  return t && (e = e.replace(/\w/g, "")), `[${t ? "\\w" : ""}${e.replace(/[^\w\s]/g, "\\$&")}]`;
}
function IS(n) {
  let e = /* @__PURE__ */ Object.create(null), t = /* @__PURE__ */ Object.create(null);
  for (let { label: r } of n) {
    e[r[0]] = !0;
    for (let s = 1; s < r.length; s++)
      t[r[s]] = !0;
  }
  let i = Ih(e) + Ih(t) + "*$";
  return [new RegExp("^" + i), new RegExp(i)];
}
function Gl(n) {
  let e = n.map((r) => typeof r == "string" ? { label: r } : r), [t, i] = e.every((r) => /^\w+$/.test(r.label)) ? [/\w*$/, /\w+$/] : IS(e);
  return (r) => {
    let s = r.matchBefore(i);
    return s || r.explicit ? { from: s ? s.from : r.pos, options: e, validFor: t } : null;
  };
}
function Uu(n, e) {
  return (t) => {
    for (let i = I(t.state).resolveInner(t.pos, -1); i; i = i.parent) {
      if (n.indexOf(i.name) > -1)
        return null;
      if (i.type.isTop)
        break;
    }
    return e(t);
  };
}
class Gh {
  constructor(e, t, i, r) {
    this.completion = e, this.source = t, this.match = i, this.score = r;
  }
}
function ni(n) {
  return n.selection.main.from;
}
function Du(n, e) {
  var t;
  let { source: i } = n, r = e && i[0] != "^", s = i[i.length - 1] != "$";
  return !r && !s ? n : new RegExp(`${r ? "^" : ""}(?:${i})${s ? "$" : ""}`, (t = n.flags) !== null && t !== void 0 ? t : n.ignoreCase ? "i" : "");
}
const Nl = /* @__PURE__ */ Pt.define();
function GS(n, e, t, i) {
  let { main: r } = n.selection, s = t - r.from, o = i - r.from;
  return {
    ...n.changeByRange((l) => {
      if (l != r && t != i && n.sliceDoc(l.from + s, l.from + o) != n.sliceDoc(t, i))
        return { range: l };
      let a = n.toText(e);
      return {
        changes: { from: l.from + s, to: i == r.from ? l.to : l.from + o, insert: a },
        range: S.cursor(l.from + s + a.length)
      };
    }),
    scrollIntoView: !0,
    userEvent: "input.complete"
  };
}
const Nh = /* @__PURE__ */ new WeakMap();
function NS(n) {
  if (!Array.isArray(n))
    return n;
  let e = Nh.get(n);
  return e || Nh.set(n, e = Gl(n)), e;
}
const Dr = /* @__PURE__ */ W.define(), kn = /* @__PURE__ */ W.define();
class FS {
  constructor(e) {
    this.pattern = e, this.chars = [], this.folded = [], this.any = [], this.precise = [], this.byWord = [], this.score = 0, this.matched = [];
    for (let t = 0; t < e.length; ) {
      let i = Ae(e, t), r = nt(i);
      this.chars.push(i);
      let s = e.slice(t, t + r), o = s.toUpperCase();
      this.folded.push(Ae(o == s ? s.toLowerCase() : o, 0)), t += r;
    }
    this.astral = e.length != this.chars.length;
  }
  ret(e, t) {
    return this.score = e, this.matched = t, this;
  }
  // Matches a given word (completion) against the pattern (input).
  // Will return a boolean indicating whether there was a match and,
  // on success, set `this.score` to the score, `this.matched` to an
  // array of `from, to` pairs indicating the matched parts of `word`.
  //
  // The score is a number that is more negative the worse the match
  // is. See `Penalty` above.
  match(e) {
    if (this.pattern.length == 0)
      return this.ret(-100, []);
    if (e.length < this.pattern.length)
      return null;
    let { chars: t, folded: i, any: r, precise: s, byWord: o } = this;
    if (t.length == 1) {
      let b = Ae(e, 0), y = nt(b), C = y == e.length ? 0 : -100;
      if (b != t[0]) if (b == i[0])
        C += -200;
      else
        return null;
      return this.ret(C, [0, y]);
    }
    let l = e.indexOf(this.pattern);
    if (l == 0)
      return this.ret(e.length == this.pattern.length ? 0 : -100, [0, this.pattern.length]);
    let a = t.length, h = 0;
    if (l < 0) {
      for (let b = 0, y = Math.min(e.length, 200); b < y && h < a; ) {
        let C = Ae(e, b);
        (C == t[h] || C == i[h]) && (r[h++] = b), b += nt(C);
      }
      if (h < a)
        return null;
    }
    let O = 0, c = 0, f = !1, u = 0, d = -1, p = -1, g = /[a-z]/.test(e), Q = !0;
    for (let b = 0, y = Math.min(e.length, 200), C = 0; b < y && c < a; ) {
      let k = Ae(e, b);
      l < 0 && (O < a && k == t[O] && (s[O++] = b), u < a && (k == t[u] || k == i[u] ? (u == 0 && (d = b), p = b + 1, u++) : u = 0));
      let x, P = k < 255 ? k >= 48 && k <= 57 || k >= 97 && k <= 122 ? 2 : k >= 65 && k <= 90 ? 1 : 0 : (x = pl(k)) != x.toLowerCase() ? 1 : x != x.toUpperCase() ? 2 : 0;
      (!b || P == 1 && g || C == 0 && P != 0) && (t[c] == k || i[c] == k && (f = !0) ? o[c++] = b : o.length && (Q = !1)), C = P, b += nt(k);
    }
    return c == a && o[0] == 0 && Q ? this.result(-100 + (f ? -200 : 0), o, e) : u == a && d == 0 ? this.ret(-200 - e.length + (p == e.length ? 0 : -100), [0, p]) : l > -1 ? this.ret(-700 - e.length, [l, l + this.pattern.length]) : u == a ? this.ret(-900 - e.length, [d, p]) : c == a ? this.result(-100 + (f ? -200 : 0) + -700 + (Q ? 0 : -1100), o, e) : t.length == 2 ? null : this.result((r[0] ? -700 : 0) + -200 + -1100, r, e);
  }
  result(e, t, i) {
    let r = [], s = 0;
    for (let o of t) {
      let l = o + (this.astral ? nt(Ae(i, o)) : 1);
      s && r[s - 1] == o ? r[s - 1] = l : (r[s++] = o, r[s++] = l);
    }
    return this.ret(e - i.length, r);
  }
}
class HS {
  constructor(e) {
    this.pattern = e, this.matched = [], this.score = 0, this.folded = e.toLowerCase();
  }
  match(e) {
    if (e.length < this.pattern.length)
      return null;
    let t = e.slice(0, this.pattern.length), i = t == this.pattern ? 0 : t.toLowerCase() == this.folded ? -200 : null;
    return i == null ? null : (this.matched = [0, t.length], this.score = i + (e.length == this.pattern.length ? 0 : -100), this);
  }
}
const ae = /* @__PURE__ */ X.define({
  combine(n) {
    return Vt(n, {
      activateOnTyping: !0,
      activateOnCompletion: () => !1,
      activateOnTypingDelay: 100,
      selectOnOpen: !0,
      override: null,
      closeOnBlur: !0,
      maxRenderedOptions: 100,
      defaultKeymap: !0,
      tooltipClass: () => "",
      optionClass: () => "",
      aboveCursor: !1,
      icons: !0,
      addToOptions: [],
      positionInfo: KS,
      filterStrict: !1,
      compareCompletions: (e, t) => (e.sortText || e.label).localeCompare(t.sortText || t.label),
      interactionDelay: 75,
      updateSyncTime: 100
    }, {
      defaultKeymap: (e, t) => e && t,
      closeOnBlur: (e, t) => e && t,
      icons: (e, t) => e && t,
      tooltipClass: (e, t) => (i) => Fh(e(i), t(i)),
      optionClass: (e, t) => (i) => Fh(e(i), t(i)),
      addToOptions: (e, t) => e.concat(t),
      filterStrict: (e, t) => e || t
    });
  }
});
function Fh(n, e) {
  return n ? e ? n + " " + e : n : e;
}
function KS(n, e, t, i, r, s) {
  let o = n.textDirection == K.RTL, l = o, a = !1, h = "top", O, c, f = e.left - r.left, u = r.right - e.right, d = i.right - i.left, p = i.bottom - i.top;
  if (l && f < Math.min(d, u) ? l = !1 : !l && u < Math.min(d, f) && (l = !0), d <= (l ? f : u))
    O = Math.max(r.top, Math.min(t.top, r.bottom - p)) - e.top, c = Math.min(400, l ? f : u);
  else {
    a = !0, c = Math.min(
      400,
      (o ? e.right : r.right - e.left) - 30
      /* Info.Margin */
    );
    let b = r.bottom - e.bottom;
    b >= p || b > e.top ? O = t.bottom - e.top : (h = "bottom", O = e.bottom - t.top);
  }
  let g = (e.bottom - e.top) / s.offsetHeight, Q = (e.right - e.left) / s.offsetWidth;
  return {
    style: `${h}: ${O / g}px; max-width: ${c / Q}px`,
    class: "cm-completionInfo-" + (a ? o ? "left-narrow" : "right-narrow" : l ? "left" : "right")
  };
}
const Fl = /* @__PURE__ */ W.define();
function JS(n) {
  let e = n.addToOptions.slice();
  return n.icons && e.push({
    render(t) {
      let i = document.createElement("div");
      return i.classList.add("cm-completionIcon"), t.type && i.classList.add(...t.type.split(/\s+/g).map((r) => "cm-completionIcon-" + r)), i.setAttribute("aria-hidden", "true"), i;
    },
    position: 20
  }), e.push({
    render(t, i, r, s) {
      let o = document.createElement("span");
      o.className = "cm-completionLabel";
      let l = t.displayLabel || t.label, a = 0;
      for (let h = 0; h < s.length; ) {
        let O = s[h++], c = s[h++];
        O > a && o.appendChild(document.createTextNode(l.slice(a, O)));
        let f = o.appendChild(document.createElement("span"));
        f.appendChild(document.createTextNode(l.slice(O, c))), f.className = "cm-completionMatchedText", a = c;
      }
      return a < l.length && o.appendChild(document.createTextNode(l.slice(a))), o;
    },
    position: 50
  }, {
    render(t) {
      if (!t.detail)
        return null;
      let i = document.createElement("span");
      return i.className = "cm-completionDetail", i.textContent = t.detail, i;
    },
    position: 80
  }), e.sort((t, i) => t.position - i.position).map((t) => t.render);
}
function Us(n, e, t) {
  if (n <= t)
    return { from: 0, to: n };
  if (e < 0 && (e = 0), e <= n >> 1) {
    let r = Math.floor(e / t);
    return { from: r * t, to: (r + 1) * t };
  }
  let i = Math.ceil((n - e) / t);
  return { from: n - i * t, to: n - (i - 1) * t };
}
class e1 {
  constructor(e, t, i) {
    this.view = e, this.stateField = t, this.applyCompletion = i, this.info = null, this.infoDestroy = null, this.placeInfoReq = {
      read: () => this.measureInfo(),
      write: (a) => this.placeInfo(a),
      key: this
    }, this.space = null, this.currentClass = "";
    let r = e.state.field(t), { options: s, selected: o } = r.open, l = e.state.facet(ae);
    this.optionContent = JS(l), this.optionClass = l.optionClass, this.tooltipClass = l.tooltipClass, this.range = Us(s.length, o, l.maxRenderedOptions), this.dom = document.createElement("div"), this.dom.className = "cm-tooltip-autocomplete", this.updateTooltipClass(e.state), this.dom.addEventListener("mousedown", (a) => {
      let { options: h } = e.state.field(t).open;
      for (let O = a.target, c; O && O != this.dom; O = O.parentNode)
        if (O.nodeName == "LI" && (c = /-(\d+)$/.exec(O.id)) && +c[1] < h.length) {
          this.applyCompletion(e, h[+c[1]]), a.preventDefault();
          return;
        }
      if (a.target == this.list) {
        let O = this.list.classList.contains("cm-completionListIncompleteTop") && a.clientY < this.list.firstChild.getBoundingClientRect().top ? this.range.from - 1 : this.list.classList.contains("cm-completionListIncompleteBottom") && a.clientY > this.list.lastChild.getBoundingClientRect().bottom ? this.range.to : null;
        O != null && (e.dispatch({ effects: Fl.of(O) }), a.preventDefault());
      }
    }), this.dom.addEventListener("focusout", (a) => {
      let h = e.state.field(this.stateField, !1);
      h && h.tooltip && e.state.facet(ae).closeOnBlur && a.relatedTarget != e.contentDOM && e.dispatch({ effects: kn.of(null) });
    }), this.showOptions(s, r.id);
  }
  mount() {
    this.updateSel();
  }
  showOptions(e, t) {
    this.list && this.list.remove(), this.list = this.dom.appendChild(this.createListBox(e, t, this.range)), this.list.addEventListener("scroll", () => {
      this.info && this.view.requestMeasure(this.placeInfoReq);
    });
  }
  update(e) {
    var t;
    let i = e.state.field(this.stateField), r = e.startState.field(this.stateField);
    if (this.updateTooltipClass(e.state), i != r) {
      let { options: s, selected: o, disabled: l } = i.open;
      (!r.open || r.open.options != s) && (this.range = Us(s.length, o, e.state.facet(ae).maxRenderedOptions), this.showOptions(s, i.id)), this.updateSel(), l != ((t = r.open) === null || t === void 0 ? void 0 : t.disabled) && this.dom.classList.toggle("cm-tooltip-autocomplete-disabled", !!l);
    }
  }
  updateTooltipClass(e) {
    let t = this.tooltipClass(e);
    if (t != this.currentClass) {
      for (let i of this.currentClass.split(" "))
        i && this.dom.classList.remove(i);
      for (let i of t.split(" "))
        i && this.dom.classList.add(i);
      this.currentClass = t;
    }
  }
  positioned(e) {
    this.space = e, this.info && this.view.requestMeasure(this.placeInfoReq);
  }
  updateSel() {
    let e = this.view.state.field(this.stateField), t = e.open;
    (t.selected > -1 && t.selected < this.range.from || t.selected >= this.range.to) && (this.range = Us(t.options.length, t.selected, this.view.state.facet(ae).maxRenderedOptions), this.showOptions(t.options, e.id));
    let i = this.updateSelectedOption(t.selected);
    if (i) {
      this.destroyInfo();
      let { completion: r } = t.options[t.selected], { info: s } = r;
      if (!s)
        return;
      let o = typeof s == "string" ? document.createTextNode(s) : s(r);
      if (!o)
        return;
      "then" in o ? o.then((l) => {
        l && this.view.state.field(this.stateField, !1) == e && this.addInfoPane(l, r);
      }).catch((l) => je(this.view.state, l, "completion info")) : (this.addInfoPane(o, r), i.setAttribute("aria-describedby", this.info.id));
    }
  }
  addInfoPane(e, t) {
    this.destroyInfo();
    let i = this.info = document.createElement("div");
    if (i.className = "cm-tooltip cm-completionInfo", i.id = "cm-completionInfo-" + Math.floor(Math.random() * 65535).toString(16), e.nodeType != null)
      i.appendChild(e), this.infoDestroy = null;
    else {
      let { dom: r, destroy: s } = e;
      i.appendChild(r), this.infoDestroy = s || null;
    }
    this.dom.appendChild(i), this.view.requestMeasure(this.placeInfoReq);
  }
  updateSelectedOption(e) {
    let t = null;
    for (let i = this.list.firstChild, r = this.range.from; i; i = i.nextSibling, r++)
      i.nodeName != "LI" || !i.id ? r-- : r == e ? i.hasAttribute("aria-selected") || (i.setAttribute("aria-selected", "true"), t = i) : i.hasAttribute("aria-selected") && (i.removeAttribute("aria-selected"), i.removeAttribute("aria-describedby"));
    return t && i1(this.list, t), t;
  }
  measureInfo() {
    let e = this.dom.querySelector("[aria-selected]");
    if (!e || !this.info)
      return null;
    let t = this.dom.getBoundingClientRect(), i = this.info.getBoundingClientRect(), r = e.getBoundingClientRect(), s = this.space;
    if (!s) {
      let o = this.dom.ownerDocument.documentElement;
      s = { left: 0, top: 0, right: o.clientWidth, bottom: o.clientHeight };
    }
    return r.top > Math.min(s.bottom, t.bottom) - 10 || r.bottom < Math.max(s.top, t.top) + 10 ? null : this.view.state.facet(ae).positionInfo(this.view, t, r, i, s, this.dom);
  }
  placeInfo(e) {
    this.info && (e ? (e.style && (this.info.style.cssText = e.style), this.info.className = "cm-tooltip cm-completionInfo " + (e.class || "")) : this.info.style.cssText = "top: -1e6px");
  }
  createListBox(e, t, i) {
    const r = document.createElement("ul");
    r.id = t, r.setAttribute("role", "listbox"), r.setAttribute("aria-expanded", "true"), r.setAttribute("aria-label", this.view.state.phrase("Completions")), r.addEventListener("mousedown", (o) => {
      o.target == r && o.preventDefault();
    });
    let s = null;
    for (let o = i.from; o < i.to; o++) {
      let { completion: l, match: a } = e[o], { section: h } = l;
      if (h) {
        let f = typeof h == "string" ? h : h.name;
        if (f != s && (o > i.from || i.from == 0))
          if (s = f, typeof h != "string" && h.header)
            r.appendChild(h.header(h));
          else {
            let u = r.appendChild(document.createElement("completion-section"));
            u.textContent = f;
          }
      }
      const O = r.appendChild(document.createElement("li"));
      O.id = t + "-" + o, O.setAttribute("role", "option");
      let c = this.optionClass(l);
      c && (O.className = c);
      for (let f of this.optionContent) {
        let u = f(l, this.view.state, this.view, a);
        u && O.appendChild(u);
      }
    }
    return i.from && r.classList.add("cm-completionListIncompleteTop"), i.to < e.length && r.classList.add("cm-completionListIncompleteBottom"), r;
  }
  destroyInfo() {
    this.info && (this.infoDestroy && this.infoDestroy(), this.info.remove(), this.info = null);
  }
  destroy() {
    this.destroyInfo();
  }
}
function t1(n, e) {
  return (t) => new e1(t, n, e);
}
function i1(n, e) {
  let t = n.getBoundingClientRect(), i = e.getBoundingClientRect(), r = t.height / n.offsetHeight;
  i.top < t.top ? n.scrollTop -= (t.top - i.top) / r : i.bottom > t.bottom && (n.scrollTop += (i.bottom - t.bottom) / r);
}
function Hh(n) {
  return (n.boost || 0) * 100 + (n.apply ? 10 : 0) + (n.info ? 5 : 0) + (n.type ? 1 : 0);
}
function n1(n, e) {
  let t = [], i = null, r = null, s = (O) => {
    t.push(O);
    let { section: c } = O.completion;
    if (c) {
      i || (i = []);
      let f = typeof c == "string" ? c : c.name;
      i.some((u) => u.name == f) || i.push(typeof c == "string" ? { name: f } : c);
    }
  }, o = e.facet(ae);
  for (let O of n)
    if (O.hasResult()) {
      let c = O.result.getMatch;
      if (O.result.filter === !1)
        for (let f of O.result.options)
          s(new Gh(f, O.source, c ? c(f) : [], 1e9 - t.length));
      else {
        let f = e.sliceDoc(O.from, O.to), u, d = o.filterStrict ? new HS(f) : new FS(f);
        for (let p of O.result.options)
          if (u = d.match(p.label)) {
            let g = p.displayLabel ? c ? c(p, u.matched) : [] : u.matched, Q = u.score + (p.boost || 0);
            if (s(new Gh(p, O.source, g, Q)), typeof p.section == "object" && p.section.rank === "dynamic") {
              let { name: b } = p.section;
              r || (r = /* @__PURE__ */ Object.create(null)), r[b] = Math.max(Q, r[b] || -1e9);
            }
          }
      }
    }
  if (i) {
    let O = /* @__PURE__ */ Object.create(null), c = 0, f = (u, d) => (u.rank === "dynamic" && d.rank === "dynamic" ? r[d.name] - r[u.name] : 0) || (typeof u.rank == "number" ? u.rank : 1e9) - (typeof d.rank == "number" ? d.rank : 1e9) || (u.name < d.name ? -1 : 1);
    for (let u of i.sort(f))
      c -= 1e5, O[u.name] = c;
    for (let u of t) {
      let { section: d } = u.completion;
      d && (u.score += O[typeof d == "string" ? d : d.name]);
    }
  }
  let l = [], a = null, h = o.compareCompletions;
  for (let O of t.sort((c, f) => f.score - c.score || h(c.completion, f.completion))) {
    let c = O.completion;
    !a || a.label != c.label || a.detail != c.detail || a.type != null && c.type != null && a.type != c.type || a.apply != c.apply || a.boost != c.boost ? l.push(O) : Hh(O.completion) > Hh(a) && (l[l.length - 1] = O), a = O.completion;
  }
  return l;
}
class bi {
  constructor(e, t, i, r, s, o) {
    this.options = e, this.attrs = t, this.tooltip = i, this.timestamp = r, this.selected = s, this.disabled = o;
  }
  setSelected(e, t) {
    return e == this.selected || e >= this.options.length ? this : new bi(this.options, Kh(t, e), this.tooltip, this.timestamp, e, this.disabled);
  }
  static build(e, t, i, r, s, o) {
    if (r && !o && e.some((h) => h.isPending))
      return r.setDisabled();
    let l = n1(e, t);
    if (!l.length)
      return r && e.some((h) => h.isPending) ? r.setDisabled() : null;
    let a = t.facet(ae).selectOnOpen ? 0 : -1;
    if (r && r.selected != a && r.selected != -1) {
      let h = r.options[r.selected].completion;
      for (let O = 0; O < l.length; O++)
        if (l[O].completion == h) {
          a = O;
          break;
        }
    }
    return new bi(l, Kh(i, a), {
      pos: e.reduce((h, O) => O.hasResult() ? Math.min(h, O.from) : h, 1e8),
      create: h1,
      above: s.aboveCursor
    }, r ? r.timestamp : Date.now(), a, !1);
  }
  map(e) {
    return new bi(this.options, this.attrs, { ...this.tooltip, pos: e.mapPos(this.tooltip.pos) }, this.timestamp, this.selected, this.disabled);
  }
  setDisabled() {
    return new bi(this.options, this.attrs, this.tooltip, this.timestamp, this.selected, !0);
  }
}
class Br {
  constructor(e, t, i) {
    this.active = e, this.id = t, this.open = i;
  }
  static start() {
    return new Br(l1, "cm-ac-" + Math.floor(Math.random() * 2e6).toString(36), null);
  }
  update(e) {
    let { state: t } = e, i = t.facet(ae), s = (i.override || t.languageDataAt("autocomplete", ni(t)).map(NS)).map((a) => (this.active.find((O) => O.source == a) || new Ye(
      a,
      this.active.some(
        (O) => O.state != 0
        /* State.Inactive */
      ) ? 1 : 0
      /* State.Inactive */
    )).update(e, i));
    s.length == this.active.length && s.every((a, h) => a == this.active[h]) && (s = this.active);
    let o = this.open, l = e.effects.some((a) => a.is(Hl));
    o && e.docChanged && (o = o.map(e.changes)), e.selection || s.some((a) => a.hasResult() && e.changes.touchesRange(a.from, a.to)) || !r1(s, this.active) || l ? o = bi.build(s, t, this.id, o, i, l) : o && o.disabled && !s.some((a) => a.isPending) && (o = null), !o && s.every((a) => !a.isPending) && s.some((a) => a.hasResult()) && (s = s.map((a) => a.hasResult() ? new Ye(
      a.source,
      0
      /* State.Inactive */
    ) : a));
    for (let a of e.effects)
      a.is(Fl) && (o = o && o.setSelected(a.value, this.id));
    return s == this.active && o == this.open ? this : new Br(s, this.id, o);
  }
  get tooltip() {
    return this.open ? this.open.tooltip : null;
  }
  get attrs() {
    return this.open ? this.open.attrs : this.active.length ? s1 : o1;
  }
}
function r1(n, e) {
  if (n == e)
    return !0;
  for (let t = 0, i = 0; ; ) {
    for (; t < n.length && !n[t].hasResult(); )
      t++;
    for (; i < e.length && !e[i].hasResult(); )
      i++;
    let r = t == n.length, s = i == e.length;
    if (r || s)
      return r == s;
    if (n[t++].result != e[i++].result)
      return !1;
  }
}
const s1 = {
  "aria-autocomplete": "list"
}, o1 = {};
function Kh(n, e) {
  let t = {
    "aria-autocomplete": "list",
    "aria-haspopup": "listbox",
    "aria-controls": n
  };
  return e > -1 && (t["aria-activedescendant"] = n + "-" + e), t;
}
const l1 = [];
function Bu(n, e) {
  if (n.isUserEvent("input.complete")) {
    let i = n.annotation(Nl);
    if (i && e.activateOnCompletion(i))
      return 12;
  }
  let t = n.isUserEvent("input.type");
  return t && e.activateOnTyping ? 5 : t ? 1 : n.isUserEvent("delete.backward") ? 2 : n.selection ? 8 : n.docChanged ? 16 : 0;
}
class Ye {
  constructor(e, t, i = !1) {
    this.source = e, this.state = t, this.explicit = i;
  }
  hasResult() {
    return !1;
  }
  get isPending() {
    return this.state == 1;
  }
  update(e, t) {
    let i = Bu(e, t), r = this;
    (i & 8 || i & 16 && this.touches(e)) && (r = new Ye(
      r.source,
      0
      /* State.Inactive */
    )), i & 4 && r.state == 0 && (r = new Ye(
      this.source,
      1
      /* State.Pending */
    )), r = r.updateFor(e, i);
    for (let s of e.effects)
      if (s.is(Dr))
        r = new Ye(r.source, 1, s.value);
      else if (s.is(kn))
        r = new Ye(
          r.source,
          0
          /* State.Inactive */
        );
      else if (s.is(Hl))
        for (let o of s.value)
          o.source == r.source && (r = o);
    return r;
  }
  updateFor(e, t) {
    return this.map(e.changes);
  }
  map(e) {
    return this;
  }
  touches(e) {
    return e.changes.touchesRange(ni(e.state));
  }
}
class Ti extends Ye {
  constructor(e, t, i, r, s, o) {
    super(e, 3, t), this.limit = i, this.result = r, this.from = s, this.to = o;
  }
  hasResult() {
    return !0;
  }
  updateFor(e, t) {
    var i;
    if (!(t & 3))
      return this.map(e.changes);
    let r = this.result;
    r.map && !e.changes.empty && (r = r.map(r, e.changes));
    let s = e.changes.mapPos(this.from), o = e.changes.mapPos(this.to, 1), l = ni(e.state);
    if (l > o || !r || t & 2 && (ni(e.startState) == this.from || l < this.limit))
      return new Ye(
        this.source,
        t & 4 ? 1 : 0
        /* State.Inactive */
      );
    let a = e.changes.mapPos(this.limit);
    return a1(r.validFor, e.state, s, o) ? new Ti(this.source, this.explicit, a, r, s, o) : r.update && (r = r.update(r, s, o, new Il(e.state, l, !1))) ? new Ti(this.source, this.explicit, a, r, r.from, (i = r.to) !== null && i !== void 0 ? i : ni(e.state)) : new Ye(this.source, 1, this.explicit);
  }
  map(e) {
    if (e.empty)
      return this;
    let t = this.result.map ? this.result.map(this.result, e) : this.result;
    return t ? new Ti(this.source, this.explicit, e.mapPos(this.limit), t, e.mapPos(this.from), e.mapPos(this.to, 1)) : new Ye(
      this.source,
      0
      /* State.Inactive */
    );
  }
  touches(e) {
    return e.changes.touchesRange(this.from, this.to);
  }
}
function a1(n, e, t, i) {
  if (!n)
    return !1;
  let r = e.sliceDoc(t, i);
  return typeof n == "function" ? n(r, t, i, e) : Du(n, !0).test(r);
}
const Hl = /* @__PURE__ */ W.define({
  map(n, e) {
    return n.map((t) => t.map(e));
  }
}), xe = /* @__PURE__ */ $e.define({
  create() {
    return Br.start();
  },
  update(n, e) {
    return n.update(e);
  },
  provide: (n) => [
    gf.from(n, (e) => e.tooltip),
    T.contentAttributes.from(n, (e) => e.attrs)
  ]
});
function Kl(n, e) {
  const t = e.completion.apply || e.completion.label;
  let i = n.state.field(xe).active.find((r) => r.source == e.source);
  return i instanceof Ti ? (typeof t == "string" ? n.dispatch({
    ...GS(n.state, t, i.from, i.to),
    annotations: Nl.of(e.completion)
  }) : t(n, e.completion, i.from, i.to), !0) : !1;
}
const h1 = /* @__PURE__ */ t1(xe, Kl);
function sr(n, e = "option") {
  return (t) => {
    let i = t.state.field(xe, !1);
    if (!i || !i.open || i.open.disabled || Date.now() - i.open.timestamp < t.state.facet(ae).interactionDelay)
      return !1;
    let r = 1, s;
    e == "page" && (s = Qf(t, i.open.tooltip)) && (r = Math.max(2, Math.floor(s.dom.offsetHeight / s.dom.querySelector("li").offsetHeight) - 1));
    let { length: o } = i.open.options, l = i.open.selected > -1 ? i.open.selected + r * (n ? 1 : -1) : n ? 0 : o - 1;
    return l < 0 ? l = e == "page" ? 0 : o - 1 : l >= o && (l = e == "page" ? o - 1 : 0), t.dispatch({ effects: Fl.of(l) }), !0;
  };
}
const O1 = (n) => {
  let e = n.state.field(xe, !1);
  return n.state.readOnly || !e || !e.open || e.open.selected < 0 || e.open.disabled || Date.now() - e.open.timestamp < n.state.facet(ae).interactionDelay ? !1 : Kl(n, e.open.options[e.open.selected]);
}, Ds = (n) => n.state.field(xe, !1) ? (n.dispatch({ effects: Dr.of(!0) }), !0) : !1, c1 = (n) => {
  let e = n.state.field(xe, !1);
  return !e || !e.active.some(
    (t) => t.state != 0
    /* State.Inactive */
  ) ? !1 : (n.dispatch({ effects: kn.of(null) }), !0);
};
class f1 {
  constructor(e, t) {
    this.active = e, this.context = t, this.time = Date.now(), this.updates = [], this.done = void 0;
  }
}
const u1 = 50, d1 = 1e3, p1 = /* @__PURE__ */ re.fromClass(class {
  constructor(n) {
    this.view = n, this.debounceUpdate = -1, this.running = [], this.debounceAccept = -1, this.pendingStart = !1, this.composing = 0;
    for (let e of n.state.field(xe).active)
      e.isPending && this.startQuery(e);
  }
  update(n) {
    let e = n.state.field(xe), t = n.state.facet(ae);
    if (!n.selectionSet && !n.docChanged && n.startState.field(xe) == e)
      return;
    let i = n.transactions.some((s) => {
      let o = Bu(s, t);
      return o & 8 || (s.selection || s.docChanged) && !(o & 3);
    });
    for (let s = 0; s < this.running.length; s++) {
      let o = this.running[s];
      if (i || o.context.abortOnDocChange && n.docChanged || o.updates.length + n.transactions.length > u1 && Date.now() - o.time > d1) {
        for (let l of o.context.abortListeners)
          try {
            l();
          } catch (a) {
            je(this.view.state, a);
          }
        o.context.abortListeners = null, this.running.splice(s--, 1);
      } else
        o.updates.push(...n.transactions);
    }
    this.debounceUpdate > -1 && clearTimeout(this.debounceUpdate), n.transactions.some((s) => s.effects.some((o) => o.is(Dr))) && (this.pendingStart = !0);
    let r = this.pendingStart ? 50 : t.activateOnTypingDelay;
    if (this.debounceUpdate = e.active.some((s) => s.isPending && !this.running.some((o) => o.active.source == s.source)) ? setTimeout(() => this.startUpdate(), r) : -1, this.composing != 0)
      for (let s of n.transactions)
        s.isUserEvent("input.type") ? this.composing = 2 : this.composing == 2 && s.selection && (this.composing = 3);
  }
  startUpdate() {
    this.debounceUpdate = -1, this.pendingStart = !1;
    let { state: n } = this.view, e = n.field(xe);
    for (let t of e.active)
      t.isPending && !this.running.some((i) => i.active.source == t.source) && this.startQuery(t);
    this.running.length && e.open && e.open.disabled && (this.debounceAccept = setTimeout(() => this.accept(), this.view.state.facet(ae).updateSyncTime));
  }
  startQuery(n) {
    let { state: e } = this.view, t = ni(e), i = new Il(e, t, n.explicit, this.view), r = new f1(n, i);
    this.running.push(r), Promise.resolve(n.source(i)).then((s) => {
      r.context.aborted || (r.done = s || null, this.scheduleAccept());
    }, (s) => {
      this.view.dispatch({ effects: kn.of(null) }), je(this.view.state, s);
    });
  }
  scheduleAccept() {
    this.running.every((n) => n.done !== void 0) ? this.accept() : this.debounceAccept < 0 && (this.debounceAccept = setTimeout(() => this.accept(), this.view.state.facet(ae).updateSyncTime));
  }
  // For each finished query in this.running, try to create a result
  // or, if appropriate, restart the query.
  accept() {
    var n;
    this.debounceAccept > -1 && clearTimeout(this.debounceAccept), this.debounceAccept = -1;
    let e = [], t = this.view.state.facet(ae), i = this.view.state.field(xe);
    for (let r = 0; r < this.running.length; r++) {
      let s = this.running[r];
      if (s.done === void 0)
        continue;
      if (this.running.splice(r--, 1), s.done) {
        let l = ni(s.updates.length ? s.updates[0].startState : this.view.state), a = Math.min(l, s.done.from + (s.active.explicit ? 0 : 1)), h = new Ti(s.active.source, s.active.explicit, a, s.done, s.done.from, (n = s.done.to) !== null && n !== void 0 ? n : l);
        for (let O of s.updates)
          h = h.update(O, t);
        if (h.hasResult()) {
          e.push(h);
          continue;
        }
      }
      let o = i.active.find((l) => l.source == s.active.source);
      if (o && o.isPending)
        if (s.done == null) {
          let l = new Ye(
            s.active.source,
            0
            /* State.Inactive */
          );
          for (let a of s.updates)
            l = l.update(a, t);
          l.isPending || e.push(l);
        } else
          this.startQuery(o);
    }
    (e.length || i.open && i.open.disabled) && this.view.dispatch({ effects: Hl.of(e) });
  }
}, {
  eventHandlers: {
    blur(n) {
      let e = this.view.state.field(xe, !1);
      if (e && e.tooltip && this.view.state.facet(ae).closeOnBlur) {
        let t = e.open && Qf(this.view, e.open.tooltip);
        (!t || !t.dom.contains(n.relatedTarget)) && setTimeout(() => this.view.dispatch({ effects: kn.of(null) }), 10);
      }
    },
    compositionstart() {
      this.composing = 1;
    },
    compositionend() {
      this.composing == 3 && setTimeout(() => this.view.dispatch({ effects: Dr.of(!1) }), 20), this.composing = 0;
    }
  }
}), m1 = typeof navigator == "object" && /* @__PURE__ */ /Win/.test(navigator.platform), g1 = /* @__PURE__ */ xt.highest(/* @__PURE__ */ T.domEventHandlers({
  keydown(n, e) {
    let t = e.state.field(xe, !1);
    if (!t || !t.open || t.open.disabled || t.open.selected < 0 || n.key.length > 1 || n.ctrlKey && !(m1 && n.altKey) || n.metaKey)
      return !1;
    let i = t.open.options[t.open.selected], r = t.active.find((o) => o.source == i.source), s = i.completion.commitCharacters || r.result.commitCharacters;
    return s && s.indexOf(n.key) > -1 && Kl(e, i), !1;
  }
})), Iu = /* @__PURE__ */ T.baseTheme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    "& > ul": {
      fontFamily: "monospace",
      whiteSpace: "nowrap",
      overflow: "hidden auto",
      maxWidth_fallback: "700px",
      maxWidth: "min(700px, 95vw)",
      minWidth: "250px",
      maxHeight: "10em",
      height: "100%",
      listStyle: "none",
      margin: 0,
      padding: 0,
      "& > li, & > completion-section": {
        padding: "1px 3px",
        lineHeight: 1.2
      },
      "& > li": {
        overflowX: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer"
      },
      "& > completion-section": {
        display: "list-item",
        borderBottom: "1px solid silver",
        paddingLeft: "0.5em",
        opacity: 0.7
      }
    }
  },
  "&light .cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "#17c",
    color: "white"
  },
  "&light .cm-tooltip-autocomplete-disabled ul li[aria-selected]": {
    background: "#777"
  },
  "&dark .cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "#347",
    color: "white"
  },
  "&dark .cm-tooltip-autocomplete-disabled ul li[aria-selected]": {
    background: "#444"
  },
  ".cm-completionListIncompleteTop:before, .cm-completionListIncompleteBottom:after": {
    content: '"···"',
    opacity: 0.5,
    display: "block",
    textAlign: "center",
    cursor: "pointer"
  },
  ".cm-tooltip.cm-completionInfo": {
    position: "absolute",
    padding: "3px 9px",
    width: "max-content",
    maxWidth: "400px",
    boxSizing: "border-box",
    whiteSpace: "pre-line"
  },
  ".cm-completionInfo.cm-completionInfo-left": { right: "100%" },
  ".cm-completionInfo.cm-completionInfo-right": { left: "100%" },
  ".cm-completionInfo.cm-completionInfo-left-narrow": { right: "30px" },
  ".cm-completionInfo.cm-completionInfo-right-narrow": { left: "30px" },
  "&light .cm-snippetField": { backgroundColor: "#00000022" },
  "&dark .cm-snippetField": { backgroundColor: "#ffffff22" },
  ".cm-snippetFieldPosition": {
    verticalAlign: "text-top",
    width: 0,
    height: "1.15em",
    display: "inline-block",
    margin: "0 -0.7px -.7em",
    borderLeft: "1.4px dotted #888"
  },
  ".cm-completionMatchedText": {
    textDecoration: "underline"
  },
  ".cm-completionDetail": {
    marginLeft: "0.5em",
    fontStyle: "italic"
  },
  ".cm-completionIcon": {
    fontSize: "90%",
    width: ".8em",
    display: "inline-block",
    textAlign: "center",
    paddingRight: ".6em",
    opacity: "0.6",
    boxSizing: "content-box"
  },
  ".cm-completionIcon-function, .cm-completionIcon-method": {
    "&:after": { content: "'ƒ'" }
  },
  ".cm-completionIcon-class": {
    "&:after": { content: "'○'" }
  },
  ".cm-completionIcon-interface": {
    "&:after": { content: "'◌'" }
  },
  ".cm-completionIcon-variable": {
    "&:after": { content: "'𝑥'" }
  },
  ".cm-completionIcon-constant": {
    "&:after": { content: "'𝐶'" }
  },
  ".cm-completionIcon-type": {
    "&:after": { content: "'𝑡'" }
  },
  ".cm-completionIcon-enum": {
    "&:after": { content: "'∪'" }
  },
  ".cm-completionIcon-property": {
    "&:after": { content: "'□'" }
  },
  ".cm-completionIcon-keyword": {
    "&:after": { content: "'🔑︎'" }
    // Disable emoji rendering
  },
  ".cm-completionIcon-namespace": {
    "&:after": { content: "'▢'" }
  },
  ".cm-completionIcon-text": {
    "&:after": { content: "'abc'", fontSize: "50%", verticalAlign: "middle" }
  }
});
class Q1 {
  constructor(e, t, i, r) {
    this.field = e, this.line = t, this.from = i, this.to = r;
  }
}
class Jl {
  constructor(e, t, i) {
    this.field = e, this.from = t, this.to = i;
  }
  map(e) {
    let t = e.mapPos(this.from, -1, me.TrackDel), i = e.mapPos(this.to, 1, me.TrackDel);
    return t == null || i == null ? null : new Jl(this.field, t, i);
  }
}
class ea {
  constructor(e, t) {
    this.lines = e, this.fieldPositions = t;
  }
  instantiate(e, t) {
    let i = [], r = [t], s = e.doc.lineAt(t), o = /^\s*/.exec(s.text)[0];
    for (let a of this.lines) {
      if (i.length) {
        let h = o, O = /^\t*/.exec(a)[0].length;
        for (let c = 0; c < O; c++)
          h += e.facet(An);
        r.push(t + h.length - O), a = h + a.slice(O);
      }
      i.push(a), t += a.length + 1;
    }
    let l = this.fieldPositions.map((a) => new Jl(a.field, r[a.line] + a.from, r[a.line] + a.to));
    return { text: i, ranges: l };
  }
  static parse(e) {
    let t = [], i = [], r = [], s;
    for (let o of e.split(/\r\n?|\n/)) {
      for (; s = /[#$]\{(?:(\d+)(?::([^{}]*))?|((?:\\[{}]|[^{}])*))\}/.exec(o); ) {
        let l = s[1] ? +s[1] : null, a = s[2] || s[3] || "", h = -1;
        l === 0 && (l = 1e9);
        let O = a.replace(/\\[{}]/g, (c) => c[1]);
        for (let c = 0; c < t.length; c++)
          (l != null ? t[c].seq == l : O && t[c].name == O) && (h = c);
        if (h < 0) {
          let c = 0;
          for (; c < t.length && (l == null || t[c].seq != null && t[c].seq < l); )
            c++;
          t.splice(c, 0, { seq: l, name: O }), h = c;
          for (let f of r)
            f.field >= h && f.field++;
        }
        for (let c of r)
          if (c.line == i.length && c.from > s.index) {
            let f = s[2] ? 3 + (s[1] || "").length : 2;
            c.from -= f, c.to -= f;
          }
        r.push(new Q1(h, i.length, s.index, s.index + O.length)), o = o.slice(0, s.index) + a + o.slice(s.index + s[0].length);
      }
      o = o.replace(/\\([{}])/g, (l, a, h) => {
        for (let O of r)
          O.line == i.length && O.from > h && (O.from--, O.to--);
        return a;
      }), i.push(o);
    }
    return new ea(i, r);
  }
}
let S1 = /* @__PURE__ */ A.widget({ widget: /* @__PURE__ */ new class extends Ut {
  toDOM() {
    let n = document.createElement("span");
    return n.className = "cm-snippetFieldPosition", n;
  }
  ignoreEvent() {
    return !1;
  }
}() }), b1 = /* @__PURE__ */ A.mark({ class: "cm-snippetField" });
class Yi {
  constructor(e, t) {
    this.ranges = e, this.active = t, this.deco = A.set(e.map((i) => (i.from == i.to ? S1 : b1).range(i.from, i.to)), !0);
  }
  map(e) {
    let t = [];
    for (let i of this.ranges) {
      let r = i.map(e);
      if (!r)
        return null;
      t.push(r);
    }
    return new Yi(t, this.active);
  }
  selectionInsideField(e) {
    return e.ranges.every((t) => this.ranges.some((i) => i.field == this.active && i.from <= t.from && i.to >= t.to));
  }
}
const zn = /* @__PURE__ */ W.define({
  map(n, e) {
    return n && n.map(e);
  }
}), y1 = /* @__PURE__ */ W.define(), $n = /* @__PURE__ */ $e.define({
  create() {
    return null;
  },
  update(n, e) {
    for (let t of e.effects) {
      if (t.is(zn))
        return t.value;
      if (t.is(y1) && n)
        return new Yi(n.ranges, t.value);
    }
    return n && e.docChanged && (n = n.map(e.changes)), n && e.selection && !n.selectionInsideField(e.selection) && (n = null), n;
  },
  provide: (n) => T.decorations.from(n, (e) => e ? e.deco : A.none)
});
function ta(n, e) {
  return S.create(n.filter((t) => t.field == e).map((t) => S.range(t.from, t.to)));
}
function k1(n) {
  let e = ea.parse(n);
  return (t, i, r, s) => {
    let { text: o, ranges: l } = e.instantiate(t.state, r), { main: a } = t.state.selection, h = {
      changes: { from: r, to: s == a.from ? a.to : s, insert: Y.of(o) },
      scrollIntoView: !0,
      annotations: i ? [Nl.of(i), ne.userEvent.of("input.complete")] : void 0
    };
    if (l.length && (h.selection = ta(l, 0)), l.some((O) => O.field > 0)) {
      let O = new Yi(l, 0), c = h.effects = [zn.of(O)];
      t.state.field($n, !1) === void 0 && c.push(W.appendConfig.of([$n, v1, T1, Iu]));
    }
    t.dispatch(t.state.update(h));
  };
}
function Gu(n) {
  return ({ state: e, dispatch: t }) => {
    let i = e.field($n, !1);
    if (!i || n < 0 && i.active == 0)
      return !1;
    let r = i.active + n, s = n > 0 && !i.ranges.some((o) => o.field == r + n);
    return t(e.update({
      selection: ta(i.ranges, r),
      effects: zn.of(s ? null : new Yi(i.ranges, r)),
      scrollIntoView: !0
    })), !0;
  };
}
const $1 = ({ state: n, dispatch: e }) => n.field($n, !1) ? (e(n.update({ effects: zn.of(null) })), !0) : !1, x1 = /* @__PURE__ */ Gu(1), P1 = /* @__PURE__ */ Gu(-1), w1 = [
  { key: "Tab", run: x1, shift: P1 },
  { key: "Escape", run: $1 }
], Jh = /* @__PURE__ */ X.define({
  combine(n) {
    return n.length ? n[0] : w1;
  }
}), v1 = /* @__PURE__ */ xt.highest(/* @__PURE__ */ ls.compute([Jh], (n) => n.facet(Jh)));
function ee(n, e) {
  return { ...e, apply: k1(n) };
}
const T1 = /* @__PURE__ */ T.domEventHandlers({
  mousedown(n, e) {
    let t = e.state.field($n, !1), i;
    if (!t || (i = e.posAtCoords({ x: n.clientX, y: n.clientY })) == null)
      return !1;
    let r = t.ranges.find((s) => s.from <= i && s.to >= i);
    return !r || r.field == t.active ? !1 : (e.dispatch({
      selection: ta(t.ranges, r.field),
      effects: zn.of(t.ranges.some((s) => s.field > r.field) ? new Yi(t.ranges, r.field) : null),
      scrollIntoView: !0
    }), !0);
  }
}), xn = {
  brackets: ["(", "[", "{", "'", '"'],
  before: ")]}:;>",
  stringPrefixes: []
}, ti = /* @__PURE__ */ W.define({
  map(n, e) {
    let t = e.mapPos(n, -1, me.TrackAfter);
    return t ?? void 0;
  }
}), ia = /* @__PURE__ */ new class extends jt {
}();
ia.startSide = 1;
ia.endSide = -1;
const Nu = /* @__PURE__ */ $e.define({
  create() {
    return _.empty;
  },
  update(n, e) {
    if (n = n.map(e.changes), e.selection) {
      let t = e.state.doc.lineAt(e.selection.main.head);
      n = n.update({ filter: (i) => i >= t.from && i <= t.to });
    }
    for (let t of e.effects)
      t.is(ti) && (n = n.update({ add: [ia.range(t.value, t.value + 1)] }));
    return n;
  }
});
function Lx() {
  return [C1, Nu];
}
const Bs = "()[]{}<>«»»«［］｛｝";
function Fu(n) {
  for (let e = 0; e < Bs.length; e += 2)
    if (Bs.charCodeAt(e) == n)
      return Bs.charAt(e + 1);
  return pl(n < 128 ? n : n + 1);
}
function Hu(n, e) {
  return n.languageDataAt("closeBrackets", e)[0] || xn;
}
const X1 = typeof navigator == "object" && /* @__PURE__ */ /Android\b/.test(navigator.userAgent), C1 = /* @__PURE__ */ T.inputHandler.of((n, e, t, i) => {
  if ((X1 ? n.composing : n.compositionStarted) || n.state.readOnly)
    return !1;
  let r = n.state.selection.main;
  if (i.length > 2 || i.length == 2 && nt(Ae(i, 0)) == 1 || e != r.from || t != r.to)
    return !1;
  let s = R1(n.state, i);
  return s ? (n.dispatch(s), !0) : !1;
}), Z1 = ({ state: n, dispatch: e }) => {
  if (n.readOnly)
    return !1;
  let i = Hu(n, n.selection.main.head).brackets || xn.brackets, r = null, s = n.changeByRange((o) => {
    if (o.empty) {
      let l = A1(n.doc, o.head);
      for (let a of i)
        if (a == l && Qs(n.doc, o.head) == Fu(Ae(a, 0)))
          return {
            changes: { from: o.head - a.length, to: o.head + a.length },
            range: S.cursor(o.head - a.length)
          };
    }
    return { range: r = o };
  });
  return r || e(n.update(s, { scrollIntoView: !0, userEvent: "delete.backward" })), !r;
}, Yx = [
  { key: "Backspace", run: Z1 }
];
function R1(n, e) {
  let t = Hu(n, n.selection.main.head), i = t.brackets || xn.brackets;
  for (let r of i) {
    let s = Fu(Ae(r, 0));
    if (e == r)
      return s == r ? W1(n, r, i.indexOf(r + r + r) > -1, t) : q1(n, r, s, t.before || xn.before);
    if (e == s && Ku(n, n.selection.main.from))
      return j1(n, r, s);
  }
  return null;
}
function Ku(n, e) {
  let t = !1;
  return n.field(Nu).between(0, n.doc.length, (i) => {
    i == e && (t = !0);
  }), t;
}
function Qs(n, e) {
  let t = n.sliceString(e, e + 2);
  return t.slice(0, nt(Ae(t, 0)));
}
function A1(n, e) {
  let t = n.sliceString(e - 2, e);
  return nt(Ae(t, 0)) == t.length ? t : t.slice(1);
}
function q1(n, e, t, i) {
  let r = null, s = n.changeByRange((o) => {
    if (!o.empty)
      return {
        changes: [{ insert: e, from: o.from }, { insert: t, from: o.to }],
        effects: ti.of(o.to + e.length),
        range: S.range(o.anchor + e.length, o.head + e.length)
      };
    let l = Qs(n.doc, o.head);
    return !l || /\s/.test(l) || i.indexOf(l) > -1 ? {
      changes: { insert: e + t, from: o.head },
      effects: ti.of(o.head + e.length),
      range: S.cursor(o.head + e.length)
    } : { range: r = o };
  });
  return r ? null : n.update(s, {
    scrollIntoView: !0,
    userEvent: "input.type"
  });
}
function j1(n, e, t) {
  let i = null, r = n.changeByRange((s) => s.empty && Qs(n.doc, s.head) == t ? {
    changes: { from: s.head, to: s.head + t.length, insert: t },
    range: S.cursor(s.head + t.length)
  } : i = { range: s });
  return i ? null : n.update(r, {
    scrollIntoView: !0,
    userEvent: "input.type"
  });
}
function W1(n, e, t, i) {
  let r = i.stringPrefixes || xn.stringPrefixes, s = null, o = n.changeByRange((l) => {
    if (!l.empty)
      return {
        changes: [{ insert: e, from: l.from }, { insert: e, from: l.to }],
        effects: ti.of(l.to + e.length),
        range: S.range(l.anchor + e.length, l.head + e.length)
      };
    let a = l.head, h = Qs(n.doc, a), O;
    if (h == e) {
      if (eO(n, a))
        return {
          changes: { insert: e + e, from: a },
          effects: ti.of(a + e.length),
          range: S.cursor(a + e.length)
        };
      if (Ku(n, a)) {
        let f = t && n.sliceDoc(a, a + e.length * 3) == e + e + e ? e + e + e : e;
        return {
          changes: { from: a, to: a + f.length, insert: f },
          range: S.cursor(a + f.length)
        };
      }
    } else {
      if (t && n.sliceDoc(a - 2 * e.length, a) == e + e && (O = tO(n, a - 2 * e.length, r)) > -1 && eO(n, O))
        return {
          changes: { insert: e + e + e + e, from: a },
          effects: ti.of(a + e.length),
          range: S.cursor(a + e.length)
        };
      if (n.charCategorizer(a)(h) != J.Word && tO(n, a, r) > -1 && !z1(n, a, e, r))
        return {
          changes: { insert: e + e, from: a },
          effects: ti.of(a + e.length),
          range: S.cursor(a + e.length)
        };
    }
    return { range: s = l };
  });
  return s ? null : n.update(o, {
    scrollIntoView: !0,
    userEvent: "input.type"
  });
}
function eO(n, e) {
  let t = I(n).resolveInner(e + 1);
  return t.parent && t.from == e;
}
function z1(n, e, t, i) {
  let r = I(n).resolveInner(e, -1), s = i.reduce((o, l) => Math.max(o, l.length), 0);
  for (let o = 0; o < 5; o++) {
    let l = n.sliceDoc(r.from, Math.min(r.to, r.from + t.length + s)), a = l.indexOf(t);
    if (!a || a > -1 && i.indexOf(l.slice(0, a)) > -1) {
      let O = r.firstChild;
      for (; O && O.from == r.from && O.to - O.from > t.length + a; ) {
        if (n.sliceDoc(O.to - t.length, O.to) == t)
          return !1;
        O = O.firstChild;
      }
      return !0;
    }
    let h = r.to == e && r.parent;
    if (!h)
      break;
    r = h;
  }
  return !1;
}
function tO(n, e, t) {
  let i = n.charCategorizer(e);
  if (i(n.sliceDoc(e - 1, e)) != J.Word)
    return e;
  for (let r of t) {
    let s = e - r.length;
    if (n.sliceDoc(s, e) == r && i(n.sliceDoc(s - 1, s)) != J.Word)
      return s;
  }
  return -1;
}
function Vx(n = {}) {
  return [
    g1,
    xe,
    ae.of(n),
    p1,
    _1,
    Iu
  ];
}
const M1 = [
  { key: "Ctrl-Space", run: Ds },
  { mac: "Alt-`", run: Ds },
  { mac: "Alt-i", run: Ds },
  { key: "Escape", run: c1 },
  { key: "ArrowDown", run: /* @__PURE__ */ sr(!0) },
  { key: "ArrowUp", run: /* @__PURE__ */ sr(!1) },
  { key: "PageDown", run: /* @__PURE__ */ sr(!0, "page") },
  { key: "PageUp", run: /* @__PURE__ */ sr(!1, "page") },
  { key: "Enter", run: O1 }
], _1 = /* @__PURE__ */ xt.highest(/* @__PURE__ */ ls.computeN([ae], (n) => n.facet(ae).defaultKeymap ? [M1] : []));
class Ir {
  /**
  @internal
  */
  constructor(e, t, i, r, s, o, l, a, h, O = 0, c) {
    this.p = e, this.stack = t, this.state = i, this.reducePos = r, this.pos = s, this.score = o, this.buffer = l, this.bufferBase = a, this.curContext = h, this.lookAhead = O, this.parent = c;
  }
  /**
  @internal
  */
  toString() {
    return `[${this.stack.filter((e, t) => t % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
  }
  // Start an empty stack
  /**
  @internal
  */
  static start(e, t, i = 0) {
    let r = e.parser.context;
    return new Ir(e, [], t, i, i, 0, [], 0, r ? new iO(r, r.start) : null, 0, null);
  }
  /**
  The stack's current [context](#lr.ContextTracker) value, if
  any. Its type will depend on the context tracker's type
  parameter, or it will be `null` if there is no context
  tracker.
  */
  get context() {
    return this.curContext ? this.curContext.context : null;
  }
  // Push a state onto the stack, tracking its start position as well
  // as the buffer base at that point.
  /**
  @internal
  */
  pushState(e, t) {
    this.stack.push(this.state, t, this.bufferBase + this.buffer.length), this.state = e;
  }
  // Apply a reduce action
  /**
  @internal
  */
  reduce(e) {
    var t;
    let i = e >> 19, r = e & 65535, { parser: s } = this.p, o = this.reducePos < this.pos - 25 && this.setLookAhead(this.pos), l = s.dynamicPrecedence(r);
    if (l && (this.score += l), i == 0) {
      r < s.minRepeatTerm && this.reducePos < this.pos && (this.reducePos = this.pos), this.pushState(s.getGoto(this.state, r, !0), this.reducePos), r < s.minRepeatTerm && this.storeNode(r, this.reducePos, this.reducePos, o ? 8 : 4, !0), this.reduceContext(r, this.reducePos);
      return;
    }
    let a = this.stack.length - (i - 1) * 3 - (e & 262144 ? 6 : 0), h = a ? this.stack[a - 2] : this.p.ranges[0].from;
    r < s.minRepeatTerm && h == this.reducePos && this.reducePos < this.pos && (this.reducePos = this.pos);
    let O = this.reducePos - h;
    O >= 2e3 && !(!((t = this.p.parser.nodeSet.types[r]) === null || t === void 0) && t.isAnonymous) && (h == this.p.lastBigReductionStart ? (this.p.bigReductionCount++, this.p.lastBigReductionSize = O) : this.p.lastBigReductionSize < O && (this.p.bigReductionCount = 1, this.p.lastBigReductionStart = h, this.p.lastBigReductionSize = O));
    let c = a ? this.stack[a - 1] : 0, f = this.bufferBase + this.buffer.length - c;
    if (r < s.minRepeatTerm || e & 131072) {
      let u = s.stateFlag(
        this.state,
        1
        /* StateFlag.Skipped */
      ) ? this.pos : this.reducePos;
      this.storeNode(r, h, u, f + 4, !0);
    }
    if (e & 262144)
      this.state = this.stack[a];
    else {
      let u = this.stack[a - 3];
      this.state = s.getGoto(u, r, !0);
    }
    for (; this.stack.length > a; )
      this.stack.pop();
    this.reduceContext(r, h);
  }
  // Shift a value into the buffer
  /**
  @internal
  */
  storeNode(e, t, i, r = 4, s = !1) {
    if (e == 0 && (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
      let o = this.buffer.length;
      if (o > 0 && this.buffer[o - 4] == 0 && this.buffer[o - 1] > -1) {
        if (t == i)
          return;
        if (this.buffer[o - 2] >= t) {
          this.buffer[o - 2] = i;
          return;
        }
      }
    }
    if (!s || this.pos == i)
      this.buffer.push(e, t, i, r);
    else {
      let o = this.buffer.length;
      if (o > 0 && (this.buffer[o - 4] != 0 || this.buffer[o - 1] < 0)) {
        let l = !1;
        for (let a = o; a > 0 && this.buffer[a - 2] > i; a -= 4)
          if (this.buffer[a - 1] >= 0) {
            l = !0;
            break;
          }
        if (l)
          for (; o > 0 && this.buffer[o - 2] > i; )
            this.buffer[o] = this.buffer[o - 4], this.buffer[o + 1] = this.buffer[o - 3], this.buffer[o + 2] = this.buffer[o - 2], this.buffer[o + 3] = this.buffer[o - 1], o -= 4, r > 4 && (r -= 4);
      }
      this.buffer[o] = e, this.buffer[o + 1] = t, this.buffer[o + 2] = i, this.buffer[o + 3] = r;
    }
  }
  // Apply a shift action
  /**
  @internal
  */
  shift(e, t, i, r) {
    if (e & 131072)
      this.pushState(e & 65535, this.pos);
    else if (e & 262144)
      this.pos = r, this.shiftContext(t, i), t <= this.p.parser.maxNode && this.buffer.push(t, i, r, 4);
    else {
      let s = e, { parser: o } = this.p;
      this.pos = r;
      let l = o.stateFlag(
        s,
        1
        /* StateFlag.Skipped */
      );
      !l && (r > i || t <= o.maxNode) && (this.reducePos = r), this.pushState(s, l ? i : Math.min(i, this.reducePos)), this.shiftContext(t, i), t <= o.maxNode && this.buffer.push(t, i, r, 4);
    }
  }
  // Apply an action
  /**
  @internal
  */
  apply(e, t, i, r) {
    e & 65536 ? this.reduce(e) : this.shift(e, t, i, r);
  }
  // Add a prebuilt (reused) node into the buffer.
  /**
  @internal
  */
  useNode(e, t) {
    let i = this.p.reused.length - 1;
    (i < 0 || this.p.reused[i] != e) && (this.p.reused.push(e), i++);
    let r = this.pos;
    this.reducePos = this.pos = r + e.length, this.pushState(t, r), this.buffer.push(
      i,
      r,
      this.reducePos,
      -1
      /* size == -1 means this is a reused value */
    ), this.curContext && this.updateContext(this.curContext.tracker.reuse(this.curContext.context, e, this, this.p.stream.reset(this.pos - e.length)));
  }
  // Split the stack. Due to the buffer sharing and the fact
  // that `this.stack` tends to stay quite shallow, this isn't very
  // expensive.
  /**
  @internal
  */
  split() {
    let e = this, t = e.buffer.length;
    for (t && e.buffer[t - 4] == 0 && (t -= 4); t > 0 && e.buffer[t - 2] > e.reducePos; )
      t -= 4;
    let i = e.buffer.slice(t), r = e.bufferBase + t;
    for (; e && r == e.bufferBase; )
      e = e.parent;
    return new Ir(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, i, r, this.curContext, this.lookAhead, e);
  }
  // Try to recover from an error by 'deleting' (ignoring) one token.
  /**
  @internal
  */
  recoverByDelete(e, t) {
    let i = e <= this.p.parser.maxNode;
    i && this.storeNode(e, this.pos, t, 4), this.storeNode(0, this.pos, t, i ? 8 : 4), this.pos = this.reducePos = t, this.score -= 190;
  }
  /**
  Check if the given term would be able to be shifted (optionally
  after some reductions) on this stack. This can be useful for
  external tokenizers that want to make sure they only provide a
  given token when it applies.
  */
  canShift(e) {
    for (let t = new E1(this); ; ) {
      let i = this.p.parser.stateSlot(
        t.state,
        4
        /* ParseState.DefaultReduce */
      ) || this.p.parser.hasAction(t.state, e);
      if (i == 0)
        return !1;
      if (!(i & 65536))
        return !0;
      t.reduce(i);
    }
  }
  // Apply up to Recover.MaxNext recovery actions that conceptually
  // inserts some missing token or rule.
  /**
  @internal
  */
  recoverByInsert(e) {
    if (this.stack.length >= 300)
      return [];
    let t = this.p.parser.nextStates(this.state);
    if (t.length > 8 || this.stack.length >= 120) {
      let r = [];
      for (let s = 0, o; s < t.length; s += 2)
        (o = t[s + 1]) != this.state && this.p.parser.hasAction(o, e) && r.push(t[s], o);
      if (this.stack.length < 120)
        for (let s = 0; r.length < 8 && s < t.length; s += 2) {
          let o = t[s + 1];
          r.some((l, a) => a & 1 && l == o) || r.push(t[s], o);
        }
      t = r;
    }
    let i = [];
    for (let r = 0; r < t.length && i.length < 4; r += 2) {
      let s = t[r + 1];
      if (s == this.state)
        continue;
      let o = this.split();
      o.pushState(s, this.pos), o.storeNode(0, o.pos, o.pos, 4, !0), o.shiftContext(t[r], this.pos), o.reducePos = this.pos, o.score -= 200, i.push(o);
    }
    return i;
  }
  // Force a reduce, if possible. Return false if that can't
  // be done.
  /**
  @internal
  */
  forceReduce() {
    let { parser: e } = this.p, t = e.stateSlot(
      this.state,
      5
      /* ParseState.ForcedReduce */
    );
    if (!(t & 65536))
      return !1;
    if (!e.validAction(this.state, t)) {
      let i = t >> 19, r = t & 65535, s = this.stack.length - i * 3;
      if (s < 0 || e.getGoto(this.stack[s], r, !1) < 0) {
        let o = this.findForcedReduction();
        if (o == null)
          return !1;
        t = o;
      }
      this.storeNode(0, this.pos, this.pos, 4, !0), this.score -= 100;
    }
    return this.reducePos = this.pos, this.reduce(t), !0;
  }
  /**
  Try to scan through the automaton to find some kind of reduction
  that can be applied. Used when the regular ForcedReduce field
  isn't a valid action. @internal
  */
  findForcedReduction() {
    let { parser: e } = this.p, t = [], i = (r, s) => {
      if (!t.includes(r))
        return t.push(r), e.allActions(r, (o) => {
          if (!(o & 393216)) if (o & 65536) {
            let l = (o >> 19) - s;
            if (l > 1) {
              let a = o & 65535, h = this.stack.length - l * 3;
              if (h >= 0 && e.getGoto(this.stack[h], a, !1) >= 0)
                return l << 19 | 65536 | a;
            }
          } else {
            let l = i(o, s + 1);
            if (l != null)
              return l;
          }
        });
    };
    return i(this.state, 0);
  }
  /**
  @internal
  */
  forceAll() {
    for (; !this.p.parser.stateFlag(
      this.state,
      2
      /* StateFlag.Accepting */
    ); )
      if (!this.forceReduce()) {
        this.storeNode(0, this.pos, this.pos, 4, !0);
        break;
      }
    return this;
  }
  /**
  Check whether this state has no further actions (assumed to be a direct descendant of the
  top state, since any other states must be able to continue
  somehow). @internal
  */
  get deadEnd() {
    if (this.stack.length != 3)
      return !1;
    let { parser: e } = this.p;
    return e.data[e.stateSlot(
      this.state,
      1
      /* ParseState.Actions */
    )] == 65535 && !e.stateSlot(
      this.state,
      4
      /* ParseState.DefaultReduce */
    );
  }
  /**
  Restart the stack (put it back in its start state). Only safe
  when this.stack.length == 3 (state is directly below the top
  state). @internal
  */
  restart() {
    this.storeNode(0, this.pos, this.pos, 4, !0), this.state = this.stack[0], this.stack.length = 0;
  }
  /**
  @internal
  */
  sameState(e) {
    if (this.state != e.state || this.stack.length != e.stack.length)
      return !1;
    for (let t = 0; t < this.stack.length; t += 3)
      if (this.stack[t] != e.stack[t])
        return !1;
    return !0;
  }
  /**
  Get the parser used by this stack.
  */
  get parser() {
    return this.p.parser;
  }
  /**
  Test whether a given dialect (by numeric ID, as exported from
  the terms file) is enabled.
  */
  dialectEnabled(e) {
    return this.p.parser.dialect.flags[e];
  }
  shiftContext(e, t) {
    this.curContext && this.updateContext(this.curContext.tracker.shift(this.curContext.context, e, this, this.p.stream.reset(t)));
  }
  reduceContext(e, t) {
    this.curContext && this.updateContext(this.curContext.tracker.reduce(this.curContext.context, e, this, this.p.stream.reset(t)));
  }
  /**
  @internal
  */
  emitContext() {
    let e = this.buffer.length - 1;
    (e < 0 || this.buffer[e] != -3) && this.buffer.push(this.curContext.hash, this.pos, this.pos, -3);
  }
  /**
  @internal
  */
  emitLookAhead() {
    let e = this.buffer.length - 1;
    (e < 0 || this.buffer[e] != -4) && this.buffer.push(this.lookAhead, this.pos, this.pos, -4);
  }
  updateContext(e) {
    if (e != this.curContext.context) {
      let t = new iO(this.curContext.tracker, e);
      t.hash != this.curContext.hash && this.emitContext(), this.curContext = t;
    }
  }
  /**
  @internal
  */
  setLookAhead(e) {
    return e <= this.lookAhead ? !1 : (this.emitLookAhead(), this.lookAhead = e, !0);
  }
  /**
  @internal
  */
  close() {
    this.curContext && this.curContext.tracker.strict && this.emitContext(), this.lookAhead > 0 && this.emitLookAhead();
  }
}
class iO {
  constructor(e, t) {
    this.tracker = e, this.context = t, this.hash = e.strict ? e.hash(t) : 0;
  }
}
class E1 {
  constructor(e) {
    this.start = e, this.state = e.state, this.stack = e.stack, this.base = this.stack.length;
  }
  reduce(e) {
    let t = e & 65535, i = e >> 19;
    i == 0 ? (this.stack == this.start.stack && (this.stack = this.stack.slice()), this.stack.push(this.state, 0, 0), this.base += 3) : this.base -= (i - 1) * 3;
    let r = this.start.p.parser.getGoto(this.stack[this.base - 3], t, !0);
    this.state = r;
  }
}
class Gr {
  constructor(e, t, i) {
    this.stack = e, this.pos = t, this.index = i, this.buffer = e.buffer, this.index == 0 && this.maybeNext();
  }
  static create(e, t = e.bufferBase + e.buffer.length) {
    return new Gr(e, t, t - e.bufferBase);
  }
  maybeNext() {
    let e = this.stack.parent;
    e != null && (this.index = this.stack.bufferBase - e.bufferBase, this.stack = e, this.buffer = e.buffer);
  }
  get id() {
    return this.buffer[this.index - 4];
  }
  get start() {
    return this.buffer[this.index - 3];
  }
  get end() {
    return this.buffer[this.index - 2];
  }
  get size() {
    return this.buffer[this.index - 1];
  }
  next() {
    this.index -= 4, this.pos -= 4, this.index == 0 && this.maybeNext();
  }
  fork() {
    return new Gr(this.stack, this.pos, this.index);
  }
}
function en(n, e = Uint16Array) {
  if (typeof n != "string")
    return n;
  let t = null;
  for (let i = 0, r = 0; i < n.length; ) {
    let s = 0;
    for (; ; ) {
      let o = n.charCodeAt(i++), l = !1;
      if (o == 126) {
        s = 65535;
        break;
      }
      o >= 92 && o--, o >= 34 && o--;
      let a = o - 32;
      if (a >= 46 && (a -= 46, l = !0), s += a, l)
        break;
      s *= 46;
    }
    t ? t[r++] = s : t = new e(s);
  }
  return t;
}
class gr {
  constructor() {
    this.start = -1, this.value = -1, this.end = -1, this.extended = -1, this.lookAhead = 0, this.mask = 0, this.context = 0;
  }
}
const nO = new gr();
class L1 {
  /**
  @internal
  */
  constructor(e, t) {
    this.input = e, this.ranges = t, this.chunk = "", this.chunkOff = 0, this.chunk2 = "", this.chunk2Pos = 0, this.next = -1, this.token = nO, this.rangeIndex = 0, this.pos = this.chunkPos = t[0].from, this.range = t[0], this.end = t[t.length - 1].to, this.readNext();
  }
  /**
  @internal
  */
  resolveOffset(e, t) {
    let i = this.range, r = this.rangeIndex, s = this.pos + e;
    for (; s < i.from; ) {
      if (!r)
        return null;
      let o = this.ranges[--r];
      s -= i.from - o.to, i = o;
    }
    for (; t < 0 ? s > i.to : s >= i.to; ) {
      if (r == this.ranges.length - 1)
        return null;
      let o = this.ranges[++r];
      s += o.from - i.to, i = o;
    }
    return s;
  }
  /**
  @internal
  */
  clipPos(e) {
    if (e >= this.range.from && e < this.range.to)
      return e;
    for (let t of this.ranges)
      if (t.to > e)
        return Math.max(e, t.from);
    return this.end;
  }
  /**
  Look at a code unit near the stream position. `.peek(0)` equals
  `.next`, `.peek(-1)` gives you the previous character, and so
  on.
  
  Note that looking around during tokenizing creates dependencies
  on potentially far-away content, which may reduce the
  effectiveness incremental parsing—when looking forward—or even
  cause invalid reparses when looking backward more than 25 code
  units, since the library does not track lookbehind.
  */
  peek(e) {
    let t = this.chunkOff + e, i, r;
    if (t >= 0 && t < this.chunk.length)
      i = this.pos + e, r = this.chunk.charCodeAt(t);
    else {
      let s = this.resolveOffset(e, 1);
      if (s == null)
        return -1;
      if (i = s, i >= this.chunk2Pos && i < this.chunk2Pos + this.chunk2.length)
        r = this.chunk2.charCodeAt(i - this.chunk2Pos);
      else {
        let o = this.rangeIndex, l = this.range;
        for (; l.to <= i; )
          l = this.ranges[++o];
        this.chunk2 = this.input.chunk(this.chunk2Pos = i), i + this.chunk2.length > l.to && (this.chunk2 = this.chunk2.slice(0, l.to - i)), r = this.chunk2.charCodeAt(0);
      }
    }
    return i >= this.token.lookAhead && (this.token.lookAhead = i + 1), r;
  }
  /**
  Accept a token. By default, the end of the token is set to the
  current stream position, but you can pass an offset (relative to
  the stream position) to change that.
  */
  acceptToken(e, t = 0) {
    let i = t ? this.resolveOffset(t, -1) : this.pos;
    if (i == null || i < this.token.start)
      throw new RangeError("Token end out of bounds");
    this.token.value = e, this.token.end = i;
  }
  /**
  Accept a token ending at a specific given position.
  */
  acceptTokenTo(e, t) {
    this.token.value = e, this.token.end = t;
  }
  getChunk() {
    if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
      let { chunk: e, chunkPos: t } = this;
      this.chunk = this.chunk2, this.chunkPos = this.chunk2Pos, this.chunk2 = e, this.chunk2Pos = t, this.chunkOff = this.pos - this.chunkPos;
    } else {
      this.chunk2 = this.chunk, this.chunk2Pos = this.chunkPos;
      let e = this.input.chunk(this.pos), t = this.pos + e.length;
      this.chunk = t > this.range.to ? e.slice(0, this.range.to - this.pos) : e, this.chunkPos = this.pos, this.chunkOff = 0;
    }
  }
  readNext() {
    return this.chunkOff >= this.chunk.length && (this.getChunk(), this.chunkOff == this.chunk.length) ? this.next = -1 : this.next = this.chunk.charCodeAt(this.chunkOff);
  }
  /**
  Move the stream forward N (defaults to 1) code units. Returns
  the new value of [`next`](#lr.InputStream.next).
  */
  advance(e = 1) {
    for (this.chunkOff += e; this.pos + e >= this.range.to; ) {
      if (this.rangeIndex == this.ranges.length - 1)
        return this.setDone();
      e -= this.range.to - this.pos, this.range = this.ranges[++this.rangeIndex], this.pos = this.range.from;
    }
    return this.pos += e, this.pos >= this.token.lookAhead && (this.token.lookAhead = this.pos + 1), this.readNext();
  }
  setDone() {
    return this.pos = this.chunkPos = this.end, this.range = this.ranges[this.rangeIndex = this.ranges.length - 1], this.chunk = "", this.next = -1;
  }
  /**
  @internal
  */
  reset(e, t) {
    if (t ? (this.token = t, t.start = e, t.lookAhead = e + 1, t.value = t.extended = -1) : this.token = nO, this.pos != e) {
      if (this.pos = e, e == this.end)
        return this.setDone(), this;
      for (; e < this.range.from; )
        this.range = this.ranges[--this.rangeIndex];
      for (; e >= this.range.to; )
        this.range = this.ranges[++this.rangeIndex];
      e >= this.chunkPos && e < this.chunkPos + this.chunk.length ? this.chunkOff = e - this.chunkPos : (this.chunk = "", this.chunkOff = 0), this.readNext();
    }
    return this;
  }
  /**
  @internal
  */
  read(e, t) {
    if (e >= this.chunkPos && t <= this.chunkPos + this.chunk.length)
      return this.chunk.slice(e - this.chunkPos, t - this.chunkPos);
    if (e >= this.chunk2Pos && t <= this.chunk2Pos + this.chunk2.length)
      return this.chunk2.slice(e - this.chunk2Pos, t - this.chunk2Pos);
    if (e >= this.range.from && t <= this.range.to)
      return this.input.read(e, t);
    let i = "";
    for (let r of this.ranges) {
      if (r.from >= t)
        break;
      r.to > e && (i += this.input.read(Math.max(r.from, e), Math.min(r.to, t)));
    }
    return i;
  }
}
class Xi {
  constructor(e, t) {
    this.data = e, this.id = t;
  }
  token(e, t) {
    let { parser: i } = t.p;
    Ju(this.data, e, t, this.id, i.data, i.tokenPrecTable);
  }
}
Xi.prototype.contextual = Xi.prototype.fallback = Xi.prototype.extend = !1;
class Nr {
  constructor(e, t, i) {
    this.precTable = t, this.elseToken = i, this.data = typeof e == "string" ? en(e) : e;
  }
  token(e, t) {
    let i = e.pos, r = 0;
    for (; ; ) {
      let s = e.next < 0, o = e.resolveOffset(1, 1);
      if (Ju(this.data, e, t, 0, this.data, this.precTable), e.token.value > -1)
        break;
      if (this.elseToken == null)
        return;
      if (s || r++, o == null)
        break;
      e.reset(o, e.token);
    }
    r && (e.reset(i, e.token), e.acceptToken(this.elseToken, r));
  }
}
Nr.prototype.contextual = Xi.prototype.fallback = Xi.prototype.extend = !1;
class de {
  /**
  Create a tokenizer. The first argument is the function that,
  given an input stream, scans for the types of tokens it
  recognizes at the stream's position, and calls
  [`acceptToken`](#lr.InputStream.acceptToken) when it finds
  one.
  */
  constructor(e, t = {}) {
    this.token = e, this.contextual = !!t.contextual, this.fallback = !!t.fallback, this.extend = !!t.extend;
  }
}
function Ju(n, e, t, i, r, s) {
  let o = 0, l = 1 << i, { dialect: a } = t.p.parser;
  e: for (; l & n[o]; ) {
    let h = n[o + 1];
    for (let u = o + 3; u < h; u += 2)
      if ((n[u + 1] & l) > 0) {
        let d = n[u];
        if (a.allows(d) && (e.token.value == -1 || e.token.value == d || Y1(d, e.token.value, r, s))) {
          e.acceptToken(d);
          break;
        }
      }
    let O = e.next, c = 0, f = n[o + 2];
    if (e.next < 0 && f > c && n[h + f * 3 - 3] == 65535) {
      o = n[h + f * 3 - 1];
      continue e;
    }
    for (; c < f; ) {
      let u = c + f >> 1, d = h + u + (u << 1), p = n[d], g = n[d + 1] || 65536;
      if (O < p)
        f = u;
      else if (O >= g)
        c = u + 1;
      else {
        o = n[d + 2], e.advance();
        continue e;
      }
    }
    break;
  }
}
function rO(n, e, t) {
  for (let i = e, r; (r = n[i]) != 65535; i++)
    if (r == t)
      return i - e;
  return -1;
}
function Y1(n, e, t, i) {
  let r = rO(t, i, e);
  return r < 0 || rO(t, i, n) < r;
}
const Xe = typeof process < "u" && process.env && /\bparse\b/.test(process.env.LOG);
let Is = null;
function sO(n, e, t) {
  let i = n.cursor(V.IncludeAnonymous);
  for (i.moveTo(e); ; )
    if (!(t < 0 ? i.childBefore(e) : i.childAfter(e)))
      for (; ; ) {
        if ((t < 0 ? i.to < e : i.from > e) && !i.type.isError)
          return t < 0 ? Math.max(0, Math.min(
            i.to - 1,
            e - 25
            /* Lookahead.Margin */
          )) : Math.min(n.length, Math.max(
            i.from + 1,
            e + 25
            /* Lookahead.Margin */
          ));
        if (t < 0 ? i.prevSibling() : i.nextSibling())
          break;
        if (!i.parent())
          return t < 0 ? 0 : n.length;
      }
}
let V1 = class {
  constructor(e, t) {
    this.fragments = e, this.nodeSet = t, this.i = 0, this.fragment = null, this.safeFrom = -1, this.safeTo = -1, this.trees = [], this.start = [], this.index = [], this.nextFragment();
  }
  nextFragment() {
    let e = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
    if (e) {
      for (this.safeFrom = e.openStart ? sO(e.tree, e.from + e.offset, 1) - e.offset : e.from, this.safeTo = e.openEnd ? sO(e.tree, e.to + e.offset, -1) - e.offset : e.to; this.trees.length; )
        this.trees.pop(), this.start.pop(), this.index.pop();
      this.trees.push(e.tree), this.start.push(-e.offset), this.index.push(0), this.nextStart = this.safeFrom;
    } else
      this.nextStart = 1e9;
  }
  // `pos` must be >= any previously given `pos` for this cursor
  nodeAt(e) {
    if (e < this.nextStart)
      return null;
    for (; this.fragment && this.safeTo <= e; )
      this.nextFragment();
    if (!this.fragment)
      return null;
    for (; ; ) {
      let t = this.trees.length - 1;
      if (t < 0)
        return this.nextFragment(), null;
      let i = this.trees[t], r = this.index[t];
      if (r == i.children.length) {
        this.trees.pop(), this.start.pop(), this.index.pop();
        continue;
      }
      let s = i.children[r], o = this.start[t] + i.positions[r];
      if (o > e)
        return this.nextStart = o, null;
      if (s instanceof z) {
        if (o == e) {
          if (o < this.safeFrom)
            return null;
          let l = o + s.length;
          if (l <= this.safeTo) {
            let a = s.prop(q.lookAhead);
            if (!a || l + a < this.fragment.to)
              return s;
          }
        }
        this.index[t]++, o + s.length >= Math.max(this.safeFrom, e) && (this.trees.push(s), this.start.push(o), this.index.push(0));
      } else
        this.index[t]++, this.nextStart = o + s.length;
    }
  }
};
class U1 {
  constructor(e, t) {
    this.stream = t, this.tokens = [], this.mainToken = null, this.actions = [], this.tokens = e.tokenizers.map((i) => new gr());
  }
  getActions(e) {
    let t = 0, i = null, { parser: r } = e.p, { tokenizers: s } = r, o = r.stateSlot(
      e.state,
      3
      /* ParseState.TokenizerMask */
    ), l = e.curContext ? e.curContext.hash : 0, a = 0;
    for (let h = 0; h < s.length; h++) {
      if (!(1 << h & o))
        continue;
      let O = s[h], c = this.tokens[h];
      if (!(i && !O.fallback) && ((O.contextual || c.start != e.pos || c.mask != o || c.context != l) && (this.updateCachedToken(c, O, e), c.mask = o, c.context = l), c.lookAhead > c.end + 25 && (a = Math.max(c.lookAhead, a)), c.value != 0)) {
        let f = t;
        if (c.extended > -1 && (t = this.addActions(e, c.extended, c.end, t)), t = this.addActions(e, c.value, c.end, t), !O.extend && (i = c, t > f))
          break;
      }
    }
    for (; this.actions.length > t; )
      this.actions.pop();
    return a && e.setLookAhead(a), !i && e.pos == this.stream.end && (i = new gr(), i.value = e.p.parser.eofTerm, i.start = i.end = e.pos, t = this.addActions(e, i.value, i.end, t)), this.mainToken = i, this.actions;
  }
  getMainToken(e) {
    if (this.mainToken)
      return this.mainToken;
    let t = new gr(), { pos: i, p: r } = e;
    return t.start = i, t.end = Math.min(i + 1, r.stream.end), t.value = i == r.stream.end ? r.parser.eofTerm : 0, t;
  }
  updateCachedToken(e, t, i) {
    let r = this.stream.clipPos(i.pos);
    if (t.token(this.stream.reset(r, e), i), e.value > -1) {
      let { parser: s } = i.p;
      for (let o = 0; o < s.specialized.length; o++)
        if (s.specialized[o] == e.value) {
          let l = s.specializers[o](this.stream.read(e.start, e.end), i);
          if (l >= 0 && i.p.parser.dialect.allows(l >> 1)) {
            l & 1 ? e.extended = l >> 1 : e.value = l >> 1;
            break;
          }
        }
    } else
      e.value = 0, e.end = this.stream.clipPos(r + 1);
  }
  putAction(e, t, i, r) {
    for (let s = 0; s < r; s += 3)
      if (this.actions[s] == e)
        return r;
    return this.actions[r++] = e, this.actions[r++] = t, this.actions[r++] = i, r;
  }
  addActions(e, t, i, r) {
    let { state: s } = e, { parser: o } = e.p, { data: l } = o;
    for (let a = 0; a < 2; a++)
      for (let h = o.stateSlot(
        s,
        a ? 2 : 1
        /* ParseState.Actions */
      ); ; h += 3) {
        if (l[h] == 65535)
          if (l[h + 1] == 1)
            h = Qt(l, h + 2);
          else {
            r == 0 && l[h + 1] == 2 && (r = this.putAction(Qt(l, h + 2), t, i, r));
            break;
          }
        l[h] == t && (r = this.putAction(Qt(l, h + 1), t, i, r));
      }
    return r;
  }
}
class D1 {
  constructor(e, t, i, r) {
    this.parser = e, this.input = t, this.ranges = r, this.recovering = 0, this.nextStackID = 9812, this.minStackPos = 0, this.reused = [], this.stoppedAt = null, this.lastBigReductionStart = -1, this.lastBigReductionSize = 0, this.bigReductionCount = 0, this.stream = new L1(t, r), this.tokens = new U1(e, this.stream), this.topTerm = e.top[1];
    let { from: s } = r[0];
    this.stacks = [Ir.start(this, e.top[0], s)], this.fragments = i.length && this.stream.end - s > e.bufferLength * 4 ? new V1(i, e.nodeSet) : null;
  }
  get parsedPos() {
    return this.minStackPos;
  }
  // Move the parser forward. This will process all parse stacks at
  // `this.pos` and try to advance them to a further position. If no
  // stack for such a position is found, it'll start error-recovery.
  //
  // When the parse is finished, this will return a syntax tree. When
  // not, it returns `null`.
  advance() {
    let e = this.stacks, t = this.minStackPos, i = this.stacks = [], r, s;
    if (this.bigReductionCount > 300 && e.length == 1) {
      let [o] = e;
      for (; o.forceReduce() && o.stack.length && o.stack[o.stack.length - 2] >= this.lastBigReductionStart; )
        ;
      this.bigReductionCount = this.lastBigReductionSize = 0;
    }
    for (let o = 0; o < e.length; o++) {
      let l = e[o];
      for (; ; ) {
        if (this.tokens.mainToken = null, l.pos > t)
          i.push(l);
        else {
          if (this.advanceStack(l, i, e))
            continue;
          {
            r || (r = [], s = []), r.push(l);
            let a = this.tokens.getMainToken(l);
            s.push(a.value, a.end);
          }
        }
        break;
      }
    }
    if (!i.length) {
      let o = r && I1(r);
      if (o)
        return Xe && console.log("Finish with " + this.stackID(o)), this.stackToTree(o);
      if (this.parser.strict)
        throw Xe && r && console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none")), new SyntaxError("No parse at " + t);
      this.recovering || (this.recovering = 5);
    }
    if (this.recovering && r) {
      let o = this.stoppedAt != null && r[0].pos > this.stoppedAt ? r[0] : this.runRecovery(r, s, i);
      if (o)
        return Xe && console.log("Force-finish " + this.stackID(o)), this.stackToTree(o.forceAll());
    }
    if (this.recovering) {
      let o = this.recovering == 1 ? 1 : this.recovering * 3;
      if (i.length > o)
        for (i.sort((l, a) => a.score - l.score); i.length > o; )
          i.pop();
      i.some((l) => l.reducePos > t) && this.recovering--;
    } else if (i.length > 1) {
      e: for (let o = 0; o < i.length - 1; o++) {
        let l = i[o];
        for (let a = o + 1; a < i.length; a++) {
          let h = i[a];
          if (l.sameState(h) || l.buffer.length > 500 && h.buffer.length > 500)
            if ((l.score - h.score || l.buffer.length - h.buffer.length) > 0)
              i.splice(a--, 1);
            else {
              i.splice(o--, 1);
              continue e;
            }
        }
      }
      i.length > 12 && (i.sort((o, l) => l.score - o.score), i.splice(
        12,
        i.length - 12
        /* Rec.MaxStackCount */
      ));
    }
    this.minStackPos = i[0].pos;
    for (let o = 1; o < i.length; o++)
      i[o].pos < this.minStackPos && (this.minStackPos = i[o].pos);
    return null;
  }
  stopAt(e) {
    if (this.stoppedAt != null && this.stoppedAt < e)
      throw new RangeError("Can't move stoppedAt forward");
    this.stoppedAt = e;
  }
  // Returns an updated version of the given stack, or null if the
  // stack can't advance normally. When `split` and `stacks` are
  // given, stacks split off by ambiguous operations will be pushed to
  // `split`, or added to `stacks` if they move `pos` forward.
  advanceStack(e, t, i) {
    let r = e.pos, { parser: s } = this, o = Xe ? this.stackID(e) + " -> " : "";
    if (this.stoppedAt != null && r > this.stoppedAt)
      return e.forceReduce() ? e : null;
    if (this.fragments) {
      let h = e.curContext && e.curContext.tracker.strict, O = h ? e.curContext.hash : 0;
      for (let c = this.fragments.nodeAt(r); c; ) {
        let f = this.parser.nodeSet.types[c.type.id] == c.type ? s.getGoto(e.state, c.type.id) : -1;
        if (f > -1 && c.length && (!h || (c.prop(q.contextHash) || 0) == O))
          return e.useNode(c, f), Xe && console.log(o + this.stackID(e) + ` (via reuse of ${s.getName(c.type.id)})`), !0;
        if (!(c instanceof z) || c.children.length == 0 || c.positions[0] > 0)
          break;
        let u = c.children[0];
        if (u instanceof z && c.positions[0] == 0)
          c = u;
        else
          break;
      }
    }
    let l = s.stateSlot(
      e.state,
      4
      /* ParseState.DefaultReduce */
    );
    if (l > 0)
      return e.reduce(l), Xe && console.log(o + this.stackID(e) + ` (via always-reduce ${s.getName(
        l & 65535
        /* Action.ValueMask */
      )})`), !0;
    if (e.stack.length >= 8400)
      for (; e.stack.length > 6e3 && e.forceReduce(); )
        ;
    let a = this.tokens.getActions(e);
    for (let h = 0; h < a.length; ) {
      let O = a[h++], c = a[h++], f = a[h++], u = h == a.length || !i, d = u ? e : e.split(), p = this.tokens.mainToken;
      if (d.apply(O, c, p ? p.start : d.pos, f), Xe && console.log(o + this.stackID(d) + ` (via ${O & 65536 ? `reduce of ${s.getName(
        O & 65535
        /* Action.ValueMask */
      )}` : "shift"} for ${s.getName(c)} @ ${r}${d == e ? "" : ", split"})`), u)
        return !0;
      d.pos > r ? t.push(d) : i.push(d);
    }
    return !1;
  }
  // Advance a given stack forward as far as it will go. Returns the
  // (possibly updated) stack if it got stuck, or null if it moved
  // forward and was given to `pushStackDedup`.
  advanceFully(e, t) {
    let i = e.pos;
    for (; ; ) {
      if (!this.advanceStack(e, null, null))
        return !1;
      if (e.pos > i)
        return oO(e, t), !0;
    }
  }
  runRecovery(e, t, i) {
    let r = null, s = !1;
    for (let o = 0; o < e.length; o++) {
      let l = e[o], a = t[o << 1], h = t[(o << 1) + 1], O = Xe ? this.stackID(l) + " -> " : "";
      if (l.deadEnd && (s || (s = !0, l.restart(), Xe && console.log(O + this.stackID(l) + " (restarted)"), this.advanceFully(l, i))))
        continue;
      let c = l.split(), f = O;
      for (let u = 0; u < 10 && c.forceReduce() && (Xe && console.log(f + this.stackID(c) + " (via force-reduce)"), !this.advanceFully(c, i)); u++)
        Xe && (f = this.stackID(c) + " -> ");
      for (let u of l.recoverByInsert(a))
        Xe && console.log(O + this.stackID(u) + " (via recover-insert)"), this.advanceFully(u, i);
      this.stream.end > l.pos ? (h == l.pos && (h++, a = 0), l.recoverByDelete(a, h), Xe && console.log(O + this.stackID(l) + ` (via recover-delete ${this.parser.getName(a)})`), oO(l, i)) : (!r || r.score < c.score) && (r = c);
    }
    return r;
  }
  // Convert the stack's buffer to a syntax tree.
  stackToTree(e) {
    return e.close(), z.build({
      buffer: Gr.create(e),
      nodeSet: this.parser.nodeSet,
      topID: this.topTerm,
      maxBufferLength: this.parser.bufferLength,
      reused: this.reused,
      start: this.ranges[0].from,
      length: e.pos - this.ranges[0].from,
      minRepeatType: this.parser.minRepeatTerm
    });
  }
  stackID(e) {
    let t = (Is || (Is = /* @__PURE__ */ new WeakMap())).get(e);
    return t || Is.set(e, t = String.fromCodePoint(this.nextStackID++)), t + e;
  }
}
function oO(n, e) {
  for (let t = 0; t < e.length; t++) {
    let i = e[t];
    if (i.pos == n.pos && i.sameState(n)) {
      e[t].score < n.score && (e[t] = n);
      return;
    }
  }
  e.push(n);
}
class B1 {
  constructor(e, t, i) {
    this.source = e, this.flags = t, this.disabled = i;
  }
  allows(e) {
    return !this.disabled || this.disabled[e] == 0;
  }
}
const Gs = (n) => n;
class na {
  /**
  Define a context tracker.
  */
  constructor(e) {
    this.start = e.start, this.shift = e.shift || Gs, this.reduce = e.reduce || Gs, this.reuse = e.reuse || Gs, this.hash = e.hash || (() => 0), this.strict = e.strict !== !1;
  }
}
class Yt extends as {
  /**
  @internal
  */
  constructor(e) {
    if (super(), this.wrappers = [], e.version != 14)
      throw new RangeError(`Parser version (${e.version}) doesn't match runtime version (14)`);
    let t = e.nodeNames.split(" ");
    this.minRepeatTerm = t.length;
    for (let l = 0; l < e.repeatNodeCount; l++)
      t.push("");
    let i = Object.keys(e.topRules).map((l) => e.topRules[l][1]), r = [];
    for (let l = 0; l < t.length; l++)
      r.push([]);
    function s(l, a, h) {
      r[l].push([a, a.deserialize(String(h))]);
    }
    if (e.nodeProps)
      for (let l of e.nodeProps) {
        let a = l[0];
        typeof a == "string" && (a = q[a]);
        for (let h = 1; h < l.length; ) {
          let O = l[h++];
          if (O >= 0)
            s(O, a, l[h++]);
          else {
            let c = l[h + -O];
            for (let f = -O; f > 0; f--)
              s(l[h++], a, c);
            h++;
          }
        }
      }
    this.nodeSet = new _i(t.map((l, a) => se.define({
      name: a >= this.minRepeatTerm ? void 0 : l,
      id: a,
      props: r[a],
      top: i.indexOf(a) > -1,
      error: a == 0,
      skipped: e.skippedNodes && e.skippedNodes.indexOf(a) > -1
    }))), e.propSources && (this.nodeSet = this.nodeSet.extend(...e.propSources)), this.strict = !1, this.bufferLength = xf;
    let o = en(e.tokenData);
    this.context = e.context, this.specializerSpecs = e.specialized || [], this.specialized = new Uint16Array(this.specializerSpecs.length);
    for (let l = 0; l < this.specializerSpecs.length; l++)
      this.specialized[l] = this.specializerSpecs[l].term;
    this.specializers = this.specializerSpecs.map(lO), this.states = en(e.states, Uint32Array), this.data = en(e.stateData), this.goto = en(e.goto), this.maxTerm = e.maxTerm, this.tokenizers = e.tokenizers.map((l) => typeof l == "number" ? new Xi(o, l) : l), this.topRules = e.topRules, this.dialects = e.dialects || {}, this.dynamicPrecedences = e.dynamicPrecedences || null, this.tokenPrecTable = e.tokenPrec, this.termNames = e.termNames || null, this.maxNode = this.nodeSet.types.length - 1, this.dialect = this.parseDialect(), this.top = this.topRules[Object.keys(this.topRules)[0]];
  }
  createParse(e, t, i) {
    let r = new D1(this, e, t, i);
    for (let s of this.wrappers)
      r = s(r, e, t, i);
    return r;
  }
  /**
  Get a goto table entry @internal
  */
  getGoto(e, t, i = !1) {
    let r = this.goto;
    if (t >= r[0])
      return -1;
    for (let s = r[t + 1]; ; ) {
      let o = r[s++], l = o & 1, a = r[s++];
      if (l && i)
        return a;
      for (let h = s + (o >> 1); s < h; s++)
        if (r[s] == e)
          return a;
      if (l)
        return -1;
    }
  }
  /**
  Check if this state has an action for a given terminal @internal
  */
  hasAction(e, t) {
    let i = this.data;
    for (let r = 0; r < 2; r++)
      for (let s = this.stateSlot(
        e,
        r ? 2 : 1
        /* ParseState.Actions */
      ), o; ; s += 3) {
        if ((o = i[s]) == 65535)
          if (i[s + 1] == 1)
            o = i[s = Qt(i, s + 2)];
          else {
            if (i[s + 1] == 2)
              return Qt(i, s + 2);
            break;
          }
        if (o == t || o == 0)
          return Qt(i, s + 1);
      }
    return 0;
  }
  /**
  @internal
  */
  stateSlot(e, t) {
    return this.states[e * 6 + t];
  }
  /**
  @internal
  */
  stateFlag(e, t) {
    return (this.stateSlot(
      e,
      0
      /* ParseState.Flags */
    ) & t) > 0;
  }
  /**
  @internal
  */
  validAction(e, t) {
    return !!this.allActions(e, (i) => i == t ? !0 : null);
  }
  /**
  @internal
  */
  allActions(e, t) {
    let i = this.stateSlot(
      e,
      4
      /* ParseState.DefaultReduce */
    ), r = i ? t(i) : void 0;
    for (let s = this.stateSlot(
      e,
      1
      /* ParseState.Actions */
    ); r == null; s += 3) {
      if (this.data[s] == 65535)
        if (this.data[s + 1] == 1)
          s = Qt(this.data, s + 2);
        else
          break;
      r = t(Qt(this.data, s + 1));
    }
    return r;
  }
  /**
  Get the states that can follow this one through shift actions or
  goto jumps. @internal
  */
  nextStates(e) {
    let t = [];
    for (let i = this.stateSlot(
      e,
      1
      /* ParseState.Actions */
    ); ; i += 3) {
      if (this.data[i] == 65535)
        if (this.data[i + 1] == 1)
          i = Qt(this.data, i + 2);
        else
          break;
      if (!(this.data[i + 2] & 1)) {
        let r = this.data[i + 1];
        t.some((s, o) => o & 1 && s == r) || t.push(this.data[i], r);
      }
    }
    return t;
  }
  /**
  Configure the parser. Returns a new parser instance that has the
  given settings modified. Settings not provided in `config` are
  kept from the original parser.
  */
  configure(e) {
    let t = Object.assign(Object.create(Yt.prototype), this);
    if (e.props && (t.nodeSet = this.nodeSet.extend(...e.props)), e.top) {
      let i = this.topRules[e.top];
      if (!i)
        throw new RangeError(`Invalid top rule name ${e.top}`);
      t.top = i;
    }
    return e.tokenizers && (t.tokenizers = this.tokenizers.map((i) => {
      let r = e.tokenizers.find((s) => s.from == i);
      return r ? r.to : i;
    })), e.specializers && (t.specializers = this.specializers.slice(), t.specializerSpecs = this.specializerSpecs.map((i, r) => {
      let s = e.specializers.find((l) => l.from == i.external);
      if (!s)
        return i;
      let o = Object.assign(Object.assign({}, i), { external: s.to });
      return t.specializers[r] = lO(o), o;
    })), e.contextTracker && (t.context = e.contextTracker), e.dialect && (t.dialect = this.parseDialect(e.dialect)), e.strict != null && (t.strict = e.strict), e.wrap && (t.wrappers = t.wrappers.concat(e.wrap)), e.bufferLength != null && (t.bufferLength = e.bufferLength), t;
  }
  /**
  Tells you whether any [parse wrappers](#lr.ParserConfig.wrap)
  are registered for this parser.
  */
  hasWrappers() {
    return this.wrappers.length > 0;
  }
  /**
  Returns the name associated with a given term. This will only
  work for all terms when the parser was generated with the
  `--names` option. By default, only the names of tagged terms are
  stored.
  */
  getName(e) {
    return this.termNames ? this.termNames[e] : String(e <= this.maxNode && this.nodeSet.types[e].name || e);
  }
  /**
  The eof term id is always allocated directly after the node
  types. @internal
  */
  get eofTerm() {
    return this.maxNode + 1;
  }
  /**
  The type of top node produced by the parser.
  */
  get topNode() {
    return this.nodeSet.types[this.top[1]];
  }
  /**
  @internal
  */
  dynamicPrecedence(e) {
    let t = this.dynamicPrecedences;
    return t == null ? 0 : t[e] || 0;
  }
  /**
  @internal
  */
  parseDialect(e) {
    let t = Object.keys(this.dialects), i = t.map(() => !1);
    if (e)
      for (let s of e.split(" ")) {
        let o = t.indexOf(s);
        o >= 0 && (i[o] = !0);
      }
    let r = null;
    for (let s = 0; s < t.length; s++)
      if (!i[s])
        for (let o = this.dialects[t[s]], l; (l = this.data[o++]) != 65535; )
          (r || (r = new Uint8Array(this.maxTerm + 1)))[l] = 1;
    return new B1(e, i, r);
  }
  /**
  Used by the output of the parser generator. Not available to
  user code. @hide
  */
  static deserialize(e) {
    return new Yt(e);
  }
}
function Qt(n, e) {
  return n[e] | n[e + 1] << 16;
}
function I1(n) {
  let e = null;
  for (let t of n) {
    let i = t.p.stoppedAt;
    (t.pos == t.p.stream.end || i != null && t.pos > i) && t.p.parser.stateFlag(
      t.state,
      2
      /* StateFlag.Accepting */
    ) && (!e || e.score < t.score) && (e = t);
  }
  return e;
}
function lO(n) {
  if (n.external) {
    let e = n.extend ? 1 : 0;
    return (t, i) => n.external(t, i) << 1 | e;
  }
  return n.get;
}
const G1 = 317, N1 = 318, aO = 1, F1 = 2, H1 = 3, K1 = 4, J1 = 319, eb = 321, tb = 322, ib = 5, nb = 6, rb = 0, sl = [
  9,
  10,
  11,
  12,
  13,
  32,
  133,
  160,
  5760,
  8192,
  8193,
  8194,
  8195,
  8196,
  8197,
  8198,
  8199,
  8200,
  8201,
  8202,
  8232,
  8233,
  8239,
  8287,
  12288
], ed = 125, sb = 59, ol = 47, ob = 42, lb = 43, ab = 45, hb = 60, Ob = 44, cb = 63, fb = 46, ub = 91, db = new na({
  start: !1,
  shift(n, e) {
    return e == ib || e == nb || e == eb ? n : e == tb;
  },
  strict: !1
}), pb = new de((n, e) => {
  let { next: t } = n;
  (t == ed || t == -1 || e.context) && n.acceptToken(J1);
}, { contextual: !0, fallback: !0 }), mb = new de((n, e) => {
  let { next: t } = n, i;
  sl.indexOf(t) > -1 || t == ol && ((i = n.peek(1)) == ol || i == ob) || t != ed && t != sb && t != -1 && !e.context && n.acceptToken(G1);
}, { contextual: !0 }), gb = new de((n, e) => {
  n.next == ub && !e.context && n.acceptToken(N1);
}, { contextual: !0 }), Qb = new de((n, e) => {
  let { next: t } = n;
  if (t == lb || t == ab) {
    if (n.advance(), t == n.next) {
      n.advance();
      let i = !e.context && e.canShift(aO);
      n.acceptToken(i ? aO : F1);
    }
  } else t == cb && n.peek(1) == fb && (n.advance(), n.advance(), (n.next < 48 || n.next > 57) && n.acceptToken(H1));
}, { contextual: !0 });
function Ns(n, e) {
  return n >= 65 && n <= 90 || n >= 97 && n <= 122 || n == 95 || n >= 192 || !e && n >= 48 && n <= 57;
}
const Sb = new de((n, e) => {
  if (n.next != hb || !e.dialectEnabled(rb) || (n.advance(), n.next == ol)) return;
  let t = 0;
  for (; sl.indexOf(n.next) > -1; )
    n.advance(), t++;
  if (Ns(n.next, !0)) {
    for (n.advance(), t++; Ns(n.next, !1); )
      n.advance(), t++;
    for (; sl.indexOf(n.next) > -1; )
      n.advance(), t++;
    if (n.next == Ob) return;
    for (let i = 0; ; i++) {
      if (i == 7) {
        if (!Ns(n.next, !0)) return;
        break;
      }
      if (n.next != "extends".charCodeAt(i)) break;
      n.advance(), t++;
    }
  }
  n.acceptToken(K1, -t);
}), bb = Dt({
  "get set async static": m.modifier,
  "for while do if else switch try catch finally return throw break continue default case defer": m.controlKeyword,
  "in of await yield void typeof delete instanceof as satisfies": m.operatorKeyword,
  "let var const using function class extends": m.definitionKeyword,
  "import export from": m.moduleKeyword,
  "with debugger new": m.keyword,
  TemplateString: m.special(m.string),
  super: m.atom,
  BooleanLiteral: m.bool,
  this: m.self,
  null: m.null,
  Star: m.modifier,
  VariableName: m.variableName,
  "CallExpression/VariableName TaggedTemplateExpression/VariableName": m.function(m.variableName),
  VariableDefinition: m.definition(m.variableName),
  Label: m.labelName,
  PropertyName: m.propertyName,
  PrivatePropertyName: m.special(m.propertyName),
  "CallExpression/MemberExpression/PropertyName": m.function(m.propertyName),
  "FunctionDeclaration/VariableDefinition": m.function(m.definition(m.variableName)),
  "ClassDeclaration/VariableDefinition": m.definition(m.className),
  "NewExpression/VariableName": m.className,
  PropertyDefinition: m.definition(m.propertyName),
  PrivatePropertyDefinition: m.definition(m.special(m.propertyName)),
  UpdateOp: m.updateOperator,
  "LineComment Hashbang": m.lineComment,
  BlockComment: m.blockComment,
  Number: m.number,
  String: m.string,
  Escape: m.escape,
  ArithOp: m.arithmeticOperator,
  LogicOp: m.logicOperator,
  BitOp: m.bitwiseOperator,
  CompareOp: m.compareOperator,
  RegExp: m.regexp,
  Equals: m.definitionOperator,
  Arrow: m.function(m.punctuation),
  ": Spread": m.punctuation,
  "( )": m.paren,
  "[ ]": m.squareBracket,
  "{ }": m.brace,
  "InterpolationStart InterpolationEnd": m.special(m.brace),
  ".": m.derefOperator,
  ", ;": m.separator,
  "@": m.meta,
  TypeName: m.typeName,
  TypeDefinition: m.definition(m.typeName),
  "type enum interface implements namespace module declare": m.definitionKeyword,
  "abstract global Privacy readonly override": m.modifier,
  "is keyof unique infer asserts": m.operatorKeyword,
  JSXAttributeValue: m.attributeValue,
  JSXText: m.content,
  "JSXStartTag JSXStartCloseTag JSXSelfCloseEndTag JSXEndTag": m.angleBracket,
  "JSXIdentifier JSXNameSpacedName": m.tagName,
  "JSXAttribute/JSXIdentifier JSXAttribute/JSXNameSpacedName": m.attributeName,
  "JSXBuiltin/JSXIdentifier": m.standard(m.tagName)
}), yb = { __proto__: null, export: 20, as: 25, from: 33, default: 36, async: 41, function: 42, in: 52, out: 55, const: 56, extends: 60, this: 64, true: 72, false: 72, null: 84, void: 88, typeof: 92, super: 108, new: 142, delete: 154, yield: 163, await: 167, class: 172, public: 237, private: 237, protected: 237, readonly: 239, instanceof: 258, satisfies: 261, import: 294, keyof: 351, unique: 355, infer: 361, asserts: 397, is: 399, abstract: 419, implements: 421, type: 423, let: 426, var: 428, using: 431, interface: 437, enum: 441, namespace: 447, module: 449, declare: 453, global: 457, defer: 473, for: 478, of: 487, while: 490, with: 494, do: 498, if: 502, else: 504, switch: 508, case: 514, try: 520, catch: 524, finally: 528, return: 532, throw: 536, break: 540, continue: 544, debugger: 548 }, kb = { __proto__: null, async: 129, get: 131, set: 133, declare: 195, public: 197, private: 197, protected: 197, static: 199, abstract: 201, override: 203, readonly: 209, accessor: 211, new: 403 }, $b = { __proto__: null, "<": 193 }, xb = Yt.deserialize({
  version: 14,
  states: "$FvQ%TQlOOO%[QlOOO'_QpOOP(lO`OOO*zQ!0MxO'#CiO+RO#tO'#CjO+aO&jO'#CjO+oO#@ItO'#DaO.QQlO'#DgO.bQlO'#DrO%[QlO'#DzO0fQlO'#ESOOQ!0Lf'#E['#E[O1PQ`O'#EXOOQO'#Ep'#EpOOQO'#Im'#ImO1XQ`O'#GtO1dQ`O'#EoO1iQ`O'#EoO3hQ!0MxO'#JsO6[Q!0MxO'#JtO6uQ`O'#F^O6zQ,UO'#FuOOQ!0Lf'#Fg'#FgO7VO7dO'#FgO9XQMhO'#F}O9`Q`O'#F|OOQ!0Lf'#Jt'#JtOOQ!0Lb'#Js'#JsO9eQ`O'#GxOOQ['#K`'#K`O9pQ`O'#IZO9uQ!0LrO'#I[OOQ['#Ja'#JaOOQ['#I`'#I`Q`QlOOQ`QlOOO9}Q!L^O'#DvO:UQlO'#EOO:]QlO'#EQO9kQ`O'#GtO:dQMhO'#CoO:rQ`O'#EnO:}Q`O'#EzO;hQMhO'#FfO;xQ`O'#GtOOQO'#Ka'#KaO;}Q`O'#KaO<]Q`O'#G|O<]Q`O'#G}O<]Q`O'#HPO9kQ`O'#HSO=SQ`O'#HVO>kQ`O'#CeO>{Q`O'#HdO?TQ`O'#HjO?TQ`O'#HlO`QlO'#HnO?TQ`O'#HpO?TQ`O'#HsO?YQ`O'#HyO?_Q!0LsO'#IPO%[QlO'#IRO?jQ!0LsO'#ITO?uQ!0LsO'#IVO9uQ!0LrO'#IXO@QQ!0MxO'#CiOASQpO'#DlQOQ`OOO%[QlO'#EQOAjQ`O'#ETO:dQMhO'#EnOAuQ`O'#EnOBQQ!bO'#FfOOQ['#Cg'#CgOOQ!0Lb'#Dq'#DqOOQ!0Lb'#Jw'#JwO%[QlO'#JwOOQO'#Jz'#JzOOQO'#Ii'#IiOCQQpO'#EgOOQ!0Lb'#Ef'#EfOOQ!0Lb'#KO'#KOOC|Q!0MSO'#EgODWQpO'#EWOOQO'#Jy'#JyODlQpO'#JzOEyQpO'#EWODWQpO'#EgPFWO&2DjO'#CbPOOO)CEO)CEOOOOO'#Ia'#IaOFcO#tO,59UOOQ!0Lh,59U,59UOOOO'#Ib'#IbOFqO&jO,59UOGPQ!L^O'#DcOOOO'#Id'#IdOGWO#@ItO,59{OOQ!0Lf,59{,59{OGfQlO'#IeOGyQ`O'#JuOIxQ!fO'#JuO+}QlO'#JuOJPQ`O,5:ROJgQ`O'#EpOJtQ`O'#KUOKPQ`O'#KTOKPQ`O'#KTOKXQ`O,5;^OK^Q`O'#KSOOQ!0Ln,5:^,5:^OKeQlO,5:^OMcQ!0MxO,5:fONSQ`O,5:nONmQ!0LrO'#KRONtQ`O'#KQO9eQ`O'#KQO! YQ`O'#KQO! bQ`O,5;]O! gQ`O'#KQO!#lQ!fO'#JtOOQ!0Lh'#Ci'#CiO%[QlO'#ESO!$[Q!fO,5:sOOQS'#J{'#J{OOQO-E<k-E<kO9kQ`O,5=`O!$rQ`O,5=`O!$wQlO,5;ZO!&zQMhO'#EkO!(eQ`O,5;ZO!(jQlO'#DyO!(tQpO,5;eO!(|QpO,5;eO%[QlO,5;eOOQ['#FU'#FUOOQ['#FW'#FWO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fO%[QlO,5;fOOQ['#F['#F[O!)[QlO,5;uOOQ!0Lf,5;z,5;zOOQ!0Lf,5;{,5;{OOQ!0Lf,5;},5;}O%[QlO'#IqO!+_Q!0LrO,5<jO%[QlO,5;fO!&zQMhO,5;fO!+|QMhO,5;fO!-nQMhO'#E^O%[QlO,5;xOOQ!0Lf,5;|,5;|O!-uQ,UO'#FkO!.rQ,UO'#KYO!.^Q,UO'#KYO!.yQ,UO'#KYOOQO'#KY'#KYO!/_Q,UO,5<TOOOW,5<a,5<aO!/pQlO'#FwOOOW'#Ip'#IpO7VO7dO,5<RO!/wQ,UO'#FyOOQ!0Lf,5<R,5<RO!0hQ$IUO'#CyOOQ!0Lh'#C}'#C}O!0{O#@ItO'#DRO!1iQMjO,5<fO!1pQ`O,5<iO!3YQ(CWO'#GYO!3jQ`O'#GZO!3oQ`O'#GZO!5_Q(CWO'#G_O!6dQpO'#GcOOQO'#Go'#GoO!,TQMhO'#GnOOQO'#Gq'#GqO!,TQMhO'#GpO!7VQ$IUO'#JmOOQ!0Lh'#Jm'#JmO!7aQ`O'#JlO!7oQ`O'#JkO!7wQ`O'#CuOOQ!0Lh'#C{'#C{O!8YQ`O'#C}OOQ!0Lh'#DV'#DVOOQ!0Lh'#DX'#DXO!8_Q`O,5<fO1SQ`O'#DZO!,TQMhO'#GQO!,TQMhO'#GSO!8gQ`O'#GUO!8lQ`O'#GVO!3oQ`O'#G]O!,TQMhO'#GbO<]Q`O'#JlO!8qQ`O'#EqO!9`Q`O,5<hOOQ!0Lb'#Cr'#CrO!9hQ`O'#ErO!:bQpO'#EsOOQ!0Lb'#KS'#KSO!:iQ!0LrO'#KbO9uQ!0LrO,5=dO`QlO,5>uOOQ['#Ji'#JiOOQ[,5>v,5>vOOQ[-E<^-E<^O!<hQ!0MxO,5:bO!=[QpO,5:`O!?WQ!0MxO,5:jO%[QlO,5:jO!AnQ!0MxO,5:lOOQO,5@{,5@{O!B_QMhO,5=`O!BmQ!0LrO'#JjO9`Q`O'#JjO!COQ!0LrO,59ZO!CZQpO,59ZO!CcQMhO,59ZO:dQMhO,59ZO!CnQ`O,5;ZO!CvQ`O'#HcO!D[Q`O'#KeO%[QlO,5<OO!=[QpO,5<QO!DdQ`O,5={O!DiQ`O,5={O!DnQ`O,5={O!D|Q`O,5={O9uQ!0LrO,5={O<]Q`O,5=kOOQO'#Cy'#CyO!ETQpO,5=hO!E]QMhO,5=iO!EhQ`O,5=kO!EmQ!bO,5=nO!EuQ`O'#KaO?YQ`O'#HXO9kQ`O'#HZO!EzQ`O'#HZO:dQMhO'#H]O!FPQ`O'#H]OOQ[,5=q,5=qO!FUQ`O'#H^O!FgQ`O'#CoO!FlQ`O,59PO!FvQ`O,59PO!H{QlO,59POOQ[,59P,59PO!I]Q!0LrO,59PO%[QlO,59PO!KhQlO'#HfOOQ['#Hg'#HgOOQ['#Hh'#HhO`QlO,5>OO!LOQ`O,5>OO`QlO,5>UO`QlO,5>WO!LTQ`O,5>YO`QlO,5>[O!LYQ`O,5>_O!L_QlO,5>eOOQ[,5>k,5>kO%[QlO,5>kO9uQ!0LrO,5>mOOQ[,5>o,5>oO#!iQ`O,5>oOOQ[,5>q,5>qO#!iQ`O,5>qOOQ[,5>s,5>sO##SQpO'#D_O%[QlO'#JwO##^QpO'#JwO##xQpO'#DmO#$ZQpO'#DmO#&lQlO'#DmO#&sQ`O'#JvO#&{Q`O,5:WOOQO'#Et'#EtO#'QQ`O'#EtO#'VQ`O'#KVO#'_Q`O,5;_O#'dQpO'#DmO#'qQpO'#EVOOQ!0Lf,5:o,5:oO%[QlO,5:oO#'xQ`O,5:oO?YQ`O,5;YO!CZQpO,5;YO!CcQMhO,5;YO:dQMhO,5;YO#(QQ`O,5@cO#(VQ07dO,5:sOOQO-E<g-E<gO#)]Q!0MSO,5;RODWQpO,5:rO#)gQpO,5:rODWQpO,5;RO!COQ!0LrO,5:rOOQ!0Lb'#Ej'#EjOOQO,5;R,5;RO%[QlO,5;RO#)tQ!0LrO,5;RO#*PQ!0LrO,5;RO!CZQpO,5:rOOQO,5;X,5;XO#*_Q!0LrO,5;RPOOO'#I_'#I_P#*sO&2DjO,58|POOO,58|,58|OOOO-E<_-E<_OOQ!0Lh1G.p1G.pOOOO-E<`-E<`OOOO,59},59}O#+OQ!bO,59}OOOO-E<b-E<bOOQ!0Lf1G/g1G/gO#+TQ!fO,5?PO+}QlO,5?POOQO,5?V,5?VO#+_QlO'#IeOOQO-E<c-E<cO#+lQ`O,5@aO#+tQ!fO,5@aO#+{Q`O,5@oOOQ!0Lf1G/m1G/mO%[QlO,5@pO#,TQ`O'#IkOOQO-E<i-E<iO#+{Q`O,5@oOOQ!0Lb1G0x1G0xOOQ!0Ln1G/x1G/xOOQ!0Ln1G0Y1G0YO%[QlO,5@mO#,iQ!0LrO,5@mO#,zQ!0LrO,5@mO#-RQ`O,5@lO9eQ`O,5@lO#-ZQ`O,5@lO#-iQ`O'#InO#-RQ`O,5@lOOQ!0Lb1G0w1G0wO!(tQpO,5:uO!)PQpO,5:uOOQS,5:w,5:wO#.ZQdO,5:wO#.cQMhO1G2zO9kQ`O1G2zOOQ!0Lf1G0u1G0uO#.qQ!0MxO1G0uO#/vQ!0MvO,5;VOOQ!0Lh'#GX'#GXO#0dQ!0MzO'#JmO!$wQlO1G0uO#2oQ!fO'#JxO%[QlO'#JxO#2yQ`O,5:eOOQ!0Lh'#D_'#D_OOQ!0Lf1G1P1G1PO%[QlO1G1POOQ!0Lf1G1g1G1gO#3OQ`O1G1PO#5dQ!0MxO1G1QO#5kQ!0MxO1G1QO#8RQ!0MxO1G1QO#8YQ!0MxO1G1QO#:pQ!0MxO1G1QO#=WQ!0MxO1G1QO#=_Q!0MxO1G1QO#=fQ!0MxO1G1QO#?|Q!0MxO1G1QO#@TQ!0MxO1G1QO#BbQ?MtO'#CiO#D]Q?MtO1G1aO#DdQ?MtO'#JtO#DwQ!0MxO,5?]OOQ!0Lb-E<o-E<oO#GUQ!0MxO1G1QO#HRQ!0MzO1G1QOOQ!0Lf1G1Q1G1QO#IUQMjO'#J}O#I`Q`O,5:xO#IeQ!0MxO1G1dO#JXQ,UO,5<XO#JaQ,UO,5<YO#JiQ,UO'#FpO#KQQ`O'#FoOOQO'#KZ'#KZOOQO'#Io'#IoO#KVQ,UO1G1oOOQ!0Lf1G1o1G1oOOOW1G1z1G1zO#KhQ?MtO'#JsO#KrQ`O,5<cO!)[QlO,5<cOOOW-E<n-E<nOOQ!0Lf1G1m1G1mO#KwQpO'#KYOOQ!0Lf,5<e,5<eO#LPQpO,5<eO#LUQMhO'#DTOOOO'#Ic'#IcO#L]O#@ItO,59mOOQ!0Lh,59m,59mO%[QlO1G2QO!8lQ`O'#IsO#LhQ`O,5<{OOQ!0Lh,5<x,5<xO!,TQMhO'#IvO#MUQMjO,5=YO!,TQMhO'#IxO#MwQMjO,5=[O!&zQMhO,5=^OOQO1G2T1G2TO#NRQ!dO'#CrO#NfQ(CWO'#ErO$ nQpO'#GcO$!UQ!dO,5<tO$!]Q`O'#K]O9eQ`O'#K]O$!kQ`O,5<vO$#RQ!dO'#C{O!,TQMhO,5<uO$#]Q`O'#G[O$#qQ`O,5<uO$#vQ!dO'#GXO$$TQ!dO'#K^O$$_Q`O'#K^O!&zQMhO'#K^O$$dQ`O,5<yO$$iQlO'#JwO$$sQpO'#GdO#$ZQpO'#GdO$%UQ`O'#GhO!3oQ`O'#GlO$%ZQ!0LrO'#IuO$%fQpO,5<}OOQ!0Lp,5<},5<}O$%mQpO'#GdO$%zQpO'#GeO$&]QpO'#GeO$&bQMjO,5=YO$&rQMjO,5=[OOQ!0Lh,5=_,5=_O!,TQMhO,5@WO!,TQMhO,5@WO$'SQ`O'#IzO$'hQ`O,5@VO$'pQ`O,59aOOQ!0Lh,59i,59iO$'uQ`O,5@WO$(uQ$IYO,59uOOQ!0Lh'#Jq'#JqO$)hQMjO,5<lO$*ZQMjO,5<nO@zQ`O,5<pOOQ!0Lh,5<q,5<qO$*eQ`O,5<wO$*jQMjO,5<|O$*zQ`O'#KQO!$wQlO1G2SO$+PQ`O1G2SO9eQ`O'#KTO$+UQ`O'#D_O9eQ`O'#EtO%[QlO'#EtO9eQ`O'#I|O$+aQ!0LrO,5@|OOQ[1G3O1G3OOOQ[1G4a1G4aOOQ!0Lf1G/|1G/|OOQ!0Lf1G/z1G/zO$-cQ!0MxO1G0UOOQ[1G2z1G2zO!&zQMhO1G2zO%[QlO1G2zO#.fQ`O1G2zO$/gQMhO'#EkOOQ!0Lb,5@U,5@UO$/tQ!0LrO,5@UOOQ[1G.u1G.uO!COQ!0LrO1G.uO!CZQpO1G.uO!CcQMhO1G.uO$0VQ`O1G0uO$0[Q`O'#CiO$0gQ`O'#KfO$0oQ`O,5=}O$0tQ`O'#KfO$0yQ`O'#KfO$1XQ`O'#JSO$1gQ`O,5APO$1oQ!fO1G1jOOQ!0Lf1G1l1G1lO9kQ`O1G3gO@zQ`O1G3gO$1vQ`O1G3gO$1{Q`O1G3gO!DnQ`O1G3gO9uQ!0LrO1G3gOOQ[1G3g1G3gO!EhQ`O1G3VO!&zQMhO1G3SO$2QQ`O1G3SOOQ[1G3T1G3TO!&zQMhO1G3TO$2VQ`O1G3TO$2_QpO'#HROOQ[1G3V1G3VO!6_QpO'#JOO!EmQ!bO1G3YOOQ[1G3Y1G3YOOQ[,5=s,5=sO$2gQMhO,5=uO9kQ`O,5=uO$%UQ`O,5=wO9`Q`O,5=wO!CZQpO,5=wO!CcQMhO,5=wO:dQMhO,5=wO$2uQ`O'#KdO$3QQ`O,5=xOOQ[1G.k1G.kO$3VQ!0LrO1G.kO@zQ`O1G.kO$3bQ`O1G.kO9uQ!0LrO1G.kO$5jQ!fO,5ARO$5wQ`O,5ARO9eQ`O,5ARO$6SQlO,5>QO$6ZQ`O,5>QOOQ[1G3j1G3jO`QlO1G3jOOQ[1G3p1G3pOOQ[1G3r1G3rO?TQ`O1G3tO$6`QlO1G3vO$:dQlO'#HuOOQ[1G3y1G3yO$:qQ`O'#H{O?YQ`O'#H}OOQ[1G4P1G4PO$:yQlO1G4PO9uQ!0LrO1G4VOOQ[1G4X1G4XOOQ!0Lb'#G`'#G`O9uQ!0LrO1G4ZO9uQ!0LrO1G4]O$?QQ`O,5@cO9eQ`O,5;`O?YQ`O,5:XO!)[QlO,5:XO!CZQpO,5:XO$?VQ?MtO,5:XOOQO,5;`,5;`O$?aQpO'#IfO$?wQ`O,5@bOOQ!0Lf1G/r1G/rO$@PQpO'#IlO$@ZQ`O,5@qOOQ!0Lb1G0y1G0yO#$ZQpO,5:XOOQO'#Ih'#IhO$@cQpO,5:qOOQ!0Ln,5:q,5:qO#'{Q`O1G0ZOOQ!0Lf1G0Z1G0ZO%[QlO1G0ZOOQ!0Lf1G0t1G0tO?YQ`O1G0tO!CZQpO1G0tO!CcQMhO1G0tOOQ!0Lb1G5}1G5}O!COQ!0LrO1G0^OOQO1G0m1G0mO%[QlO1G0mO$@jQ!0LrO1G0mO$@uQ!0LrO1G0mO!CZQpO1G0^ODWQpO1G0^O$ATQ!0LrO1G0mOOQO1G0^1G0^O$AiQ!0MxO1G0mPOOO-E<]-E<]POOO1G.h1G.hOOOO1G/i1G/iO$AsQ!bO,5<jO$A{Q!fO1G4kOOQO1G4q1G4qO%[QlO,5?PO$BVQ`O1G5{O$B_Q`O1G6ZO$BgQ!fO1G6[O9eQ`O,5?VO$BqQ!0MxO1G6XO%[QlO1G6XO$CRQ!0LrO1G6XO$CdQ`O1G6WO$CdQ`O1G6WO9eQ`O1G6WO$ClQ`O,5?YO9eQ`O,5?YOOQO,5?Y,5?YO$DQQ`O,5?YO$*zQ`O,5?YOOQO-E<l-E<lOOQS1G0a1G0aOOQS1G0c1G0cO#.^Q`O1G0cOOQ[7+(f7+(fO!&zQMhO7+(fO%[QlO7+(fO$D`Q`O7+(fO$DkQMhO7+(fO$DyQ!0MzO,5=YO$GUQ!0MzO,5=[O$IaQ!0MzO,5=YO$KrQ!0MzO,5=[O$NTQ!0MzO,59uO%!YQ!0MzO,5<lO%$eQ!0MzO,5<nO%&pQ!0MzO,5<|OOQ!0Lf7+&a7+&aO%)RQ!0MxO7+&aO%)uQlO'#IgO%*SQ`O,5@dO%*[Q!fO,5@dOOQ!0Lf1G0P1G0PO%*fQ`O7+&kOOQ!0Lf7+&k7+&kO%*kQ?MtO,5:fO%[QlO7+&{O%*uQ?MtO,5:bO%+SQ?MtO,5:jO%+^Q?MtO,5:lO%+hQMhO'#IjO%+rQ`O,5@iOOQ!0Lh1G0d1G0dOOQO1G1s1G1sOOQO1G1t1G1tO%+zQ!jO,5<[O!)[QlO,5<ZOOQO-E<m-E<mOOQ!0Lf7+'Z7+'ZOOOW7+'f7+'fOOOW1G1}1G1}O%,VQ`O1G1}OOQ!0Lf1G2P1G2POOOO,59o,59oO%,[Q!dO,59oOOOO-E<a-E<aOOQ!0Lh1G/X1G/XO%,cQ!0MxO7+'lOOQ!0Lh,5?_,5?_O%-VQMhO1G2gP%-^Q`O'#IsPOQ!0Lh-E<q-E<qO%-zQMjO,5?bOOQ!0Lh-E<t-E<tO%.mQMjO,5?dOOQ!0Lh-E<v-E<vO%.wQ!dO1G2xO%/OQ!dO'#CrO%/fQMhO'#KTO$$iQlO'#JwOOQ!0Lh1G2`1G2`O%/pQ`O'#IrO%0XQ`O,5@wO%0XQ`O,5@wO%0aQ`O,5@wO%0lQ`O,5@wOOQO1G2b1G2bO%0zQMjO1G2aO$*zQ`O'#K]O!,TQMhO1G2aO%1[Q(CWO'#ItO%1iQ`O,5@xO!&zQMhO,5@xO%1qQ!dO,5@xOOQ!0Lh1G2e1G2eO%4RQ!fO'#CiO%4]Q`O,5=QOOQ!0Lb,5=O,5=OO%4eQpO,5=OOOQ!0Lb,5=P,5=POCwQ`O,5=OO%4pQpO,5=OOOQ!0Lb,5=S,5=SO$*zQ`O,5=WOOQO,5?a,5?aOOQO-E<s-E<sOOQ!0Lp1G2i1G2iO#$ZQpO,5=OO$$iQlO,5=QO%5OQ`O,5=PO%5ZQpO,5=PO!,TQMhO'#IvO%6TQMjO1G2tO!,TQMhO'#IxO%6vQMjO1G2vO%7QQMjO1G5rO%7[QMjO1G5rOOQO,5?f,5?fOOQO-E<x-E<xOOQO1G.{1G.{O!,TQMhO1G5rO!,TQMhO1G5rO!=[QpO,59wO%[QlO,59wOOQ!0Lh,5<k,5<kO%7iQ`O1G2[O!,TQMhO1G2cO%7nQ!0MxO7+'nOOQ!0Lf7+'n7+'nO!$wQlO7+'nO%8bQ`O,5;`OOQ!0Lb,5?h,5?hOOQ!0Lb-E<z-E<zO%8gQ!dO'#K_O#'{Q`O7+(fO4UQ!fO7+(fO$DcQ`O7+(fO%8qQ!0MvO'#CiO%9UQ!0MvO,5=TO%9iQ`O,5=TO%9qQ`O,5=TOOQ!0Lb1G5p1G5pOOQ[7+$a7+$aO!COQ!0LrO7+$aO!CZQpO7+$aO!$wQlO7+&aO%9vQ`O'#JRO%:_Q`O,5AQOOQO1G3i1G3iO9kQ`O,5AQO%:_Q`O,5AQO%:gQ`O,5AQOOQO,5?n,5?nOOQO-E=Q-E=QOOQ!0Lf7+'U7+'UO%:lQ`O7+)RO9uQ!0LrO7+)RO9kQ`O7+)RO@zQ`O7+)RO%:qQ`O7+)ROOQ[7+)R7+)ROOQ[7+(q7+(qO%:vQ!0MvO7+(nO!&zQMhO7+(nO!EcQ`O7+(oOOQ[7+(o7+(oO!&zQMhO7+(oO%;QQ`O'#KcO%;]Q`O,5=mOOQO,5?j,5?jOOQO-E<|-E<|OOQ[7+(t7+(tO%<oQpO'#H[OOQ[1G3a1G3aO!&zQMhO1G3aO%[QlO1G3aO%<vQ`O1G3aO%=RQMhO1G3aO9uQ!0LrO1G3cO$%UQ`O1G3cO9`Q`O1G3cO!CZQpO1G3cO!CcQMhO1G3cO%=aQ`O'#JQO%=uQ`O,5AOO%=}QpO,5AOOOQ!0Lb1G3d1G3dOOQ[7+$V7+$VO@zQ`O7+$VO9uQ!0LrO7+$VO%>YQ`O7+$VO%[QlO1G6mO%[QlO1G6nO%>_Q!0LrO1G6mO%>iQlO1G3lO%>pQ`O1G3lO%>uQlO1G3lOOQ[7+)U7+)UO9uQ!0LrO7+)`O`QlO7+)bOOQ['#Ki'#KiOOQ['#JT'#JTO%>|QlO,5>aOOQ[,5>a,5>aO%[QlO'#HvO%?ZQ`O'#HxOOQ[,5>g,5>gO9eQ`O,5>gOOQ[,5>i,5>iOOQ[7+)k7+)kOOQ[7+)q7+)qOOQ[7+)u7+)uOOQ[7+)w7+)wO%?`QpO1G5}O%?zQ`O1G0zOOQO1G/s1G/sO%@VQ?MtO1G/sO?YQ`O1G/sO!)[QlO'#DmOOQO,5?Q,5?QOOQO-E<d-E<dOOQO,5?W,5?WOOQO-E<j-E<jO!CZQpO1G/sOOQO-E<f-E<fOOQ!0Ln1G0]1G0]OOQ!0Lf7+%u7+%uO#'{Q`O7+%uOOQ!0Lf7+&`7+&`O?YQ`O7+&`O!CZQpO7+&`OOQO7+%x7+%xO$AiQ!0MxO7+&XOOQO7+&X7+&XO%[QlO7+&XO%@aQ!0LrO7+&XO!COQ!0LrO7+%xO!CZQpO7+%xO%@lQ!0LrO7+&XO%@zQ!0MxO7++sO%[QlO7++sO%A[Q`O7++rO%A[Q`O7++rOOQO1G4t1G4tO9eQ`O1G4tO%AdQ`O1G4tOOQS7+%}7+%}O#'{Q`O<<LQO4UQ!fO<<LQO%ArQ`O<<LQOOQ[<<LQ<<LQO!&zQMhO<<LQO%[QlO<<LQO%AzQ`O<<LQO%BVQ!0MzO,5?bO%DbQ!0MzO,5?dO%FmQ!0MzO1G2aO%IOQ!0MzO1G2tO%KZQ!0MzO1G2vO%MfQ!fO,5?RO%[QlO,5?ROOQO-E<e-E<eO%MpQ`O1G6OOOQ!0Lf<<JV<<JVO%MxQ?MtO1G0uO&!PQ?MtO1G1QO&!WQ?MtO1G1QO&$XQ?MtO1G1QO&$`Q?MtO1G1QO&&aQ?MtO1G1QO&(bQ?MtO1G1QO&(iQ?MtO1G1QO&(pQ?MtO1G1QO&*qQ?MtO1G1QO&*xQ?MtO1G1QO&+PQ!0MxO<<JgO&,wQ?MtO1G1QO&-tQ?MvO1G1QO&.wQ?MvO'#JmO&0}Q?MtO1G1dO&1[Q?MtO1G0UO&1fQMjO,5?UOOQO-E<h-E<hO!)[QlO'#FrOOQO'#K['#K[OOQO1G1v1G1vO&1pQ`O1G1uO&1uQ?MtO,5?]OOOW7+'i7+'iOOOO1G/Z1G/ZO&2PQ!dO1G4yOOQ!0Lh7+(R7+(RP!&zQMhO,5?_O!,TQMhO7+(dO&2WQ`O,5?^O9eQ`O,5?^O$*zQ`O,5?^OOQO-E<p-E<pO&2fQ`O1G6cO&2fQ`O1G6cO&2nQ`O1G6cO&2yQMjO7+'{O&3ZQ!dO,5?`O&3eQ`O,5?`O!&zQMhO,5?`OOQO-E<r-E<rO&3jQ!dO1G6dO&3tQ`O1G6dO&3|Q`O1G2lO!&zQMhO1G2lOOQ!0Lb1G2j1G2jOOQ!0Lb1G2k1G2kO%4eQpO1G2jO!CZQpO1G2jOCwQ`O1G2jOOQ!0Lb1G2r1G2rO&4RQpO1G2jO&4aQ`O1G2lO$*zQ`O1G2kOCwQ`O1G2kO$$iQlO1G2lO&4iQ`O1G2kO&5]QMjO,5?bOOQ!0Lh-E<u-E<uO&6OQMjO,5?dOOQ!0Lh-E<w-E<wO!,TQMhO7++^O&6YQMjO7++^O&6dQMjO7++^OOQ!0Lh1G/c1G/cO&6qQ`O1G/cOOQ!0Lh7+'v7+'vO&6vQMjO7+'}O&7WQ!0MxO<<KYOOQ!0Lf<<KY<<KYO&7zQ`O1G0zO!&zQMhO'#I{O&8PQ`O,5@yO&:RQ!fO<<LQO!&zQMhO1G2oO&:YQ!0LrO1G2oOOQ[<<G{<<G{O!COQ!0LrO<<G{O&:kQ!0MxO<<I{OOQ!0Lf<<I{<<I{OOQO,5?m,5?mO&;_Q`O,5?mO&;dQ`O,5?mOOQO-E=P-E=PO&;rQ`O1G6lO&;rQ`O1G6lO9kQ`O1G6lO@zQ`O<<LmOOQ[<<Lm<<LmO&;zQ`O<<LmO9uQ!0LrO<<LmO9kQ`O<<LmOOQ[<<LY<<LYO%:vQ!0MvO<<LYOOQ[<<LZ<<LZO!EcQ`O<<LZO&<PQpO'#I}O&<[Q`O,5@}O!)[QlO,5@}OOQ[1G3X1G3XOOQO'#JP'#JPO9uQ!0LrO'#JPO&<dQpO,5=vOOQ[,5=v,5=vO&<kQpO'#EgO&<rQpO'#GfO&<wQ`O7+({O&<|Q`O7+({OOQ[7+({7+({O!&zQMhO7+({O%[QlO7+({O&=UQ`O7+({OOQ[7+(}7+(}O9uQ!0LrO7+(}O$%UQ`O7+(}O9`Q`O7+(}O!CZQpO7+(}O&=aQ`O,5?lOOQO-E=O-E=OOOQO'#H_'#H_O&=lQ`O1G6jO9uQ!0LrO<<GqOOQ[<<Gq<<GqO@zQ`O<<GqO&=tQ`O7+,XO&=yQ`O7+,YO%[QlO7+,XO%[QlO7+,YOOQ[7+)W7+)WO&>OQ`O7+)WO&>TQlO7+)WO&>[Q`O7+)WOOQ[<<Lz<<LzOOQ[<<L|<<L|OOQ[-E=R-E=ROOQ[1G3{1G3{O&>aQ`O,5>bOOQ[,5>d,5>dO&>fQ`O1G4RO9eQ`O7+&fO!)[QlO7+&fOOQO7+%_7+%_O&>kQ?MtO1G6[O?YQ`O7+%_OOQ!0Lf<<Ia<<IaOOQ!0Lf<<Iz<<IzO?YQ`O<<IzOOQO<<Is<<IsO$AiQ!0MxO<<IsO%[QlO<<IsOOQO<<Id<<IdO!COQ!0LrO<<IdO&>uQ!0LrO<<IsO&?QQ!0MxO<= _O&?bQ`O<= ^OOQO7+*`7+*`O9eQ`O7+*`OOQ[ANAlANAlO&?jQ!fOANAlO!&zQMhOANAlO#'{Q`OANAlO4UQ!fOANAlO&?qQ`OANAlO%[QlOANAlO&?yQ!0MzO7+'{O&B[Q!0MzO,5?bO&DgQ!0MzO,5?dO&FrQ!0MzO7+'}O&ITQ!fO1G4mO&I_Q?MtO7+&aO&KcQ?MvO,5=YO&MjQ?MvO,5=[O&MzQ?MvO,5=YO&N[Q?MvO,5=[O&NlQ?MvO,59uO'!rQ?MvO,5<lO'$uQ?MvO,5<nO''ZQ?MvO,5<|O')PQ?MtO7+'lO')^Q?MtO7+'nO')kQ`O,5<^OOQO7+'a7+'aOOQ!0Lh7+*e7+*eO')pQMjO<<LOOOQO1G4x1G4xO')wQ`O1G4xO'*SQ`O1G4xO'*bQ`O7++}O'*bQ`O7++}O!&zQMhO1G4zO'*jQ!dO1G4zO'*tQ`O7+,OO'*|Q`O7+(WO'+XQ!dO7+(WOOQ!0Lb7+(U7+(UOOQ!0Lb7+(V7+(VO!CZQpO7+(UOCwQ`O7+(UO'+cQ`O7+(WO!&zQMhO7+(WO$*zQ`O7+(VO'+hQ`O7+(WOCwQ`O7+(VO'+pQMjO<<NxO!,TQMhO<<NxOOQ!0Lh7+$}7+$}O'+zQ!dO,5?gOOQO-E<y-E<yO',UQ!0MvO7+(ZO!&zQMhO7+(ZOOQ[AN=gAN=gO9kQ`O1G5XOOQO1G5X1G5XO',fQ`O1G5XO',kQ`O7+,WO',kQ`O7+,WO9uQ!0LrOANBXO@zQ`OANBXOOQ[ANBXANBXO',sQ`OANBXOOQ[ANAtANAtOOQ[ANAuANAuO',xQ`O,5?iOOQO-E<{-E<{O'-TQ?MtO1G6iOOQO,5?k,5?kOOQO-E<}-E<}OOQ[1G3b1G3bO'-_Q`O,5=QOOQ[<<Lg<<LgO!&zQMhO<<LgO&<wQ`O<<LgO'-dQ`O<<LgO%[QlO<<LgOOQ[<<Li<<LiO9uQ!0LrO<<LiO$%UQ`O<<LiO9`Q`O<<LiO'-lQpO1G5WO'-wQ`O7+,UOOQ[AN=]AN=]O9uQ!0LrOAN=]OOQ[<= s<= sOOQ[<= t<= tO'.PQ`O<= sO'.UQ`O<= tOOQ[<<Lr<<LrO'.ZQ`O<<LrO'.`QlO<<LrOOQ[1G3|1G3|O?YQ`O7+)mO'.gQ`O<<JQO'.rQ?MtO<<JQOOQO<<Hy<<HyOOQ!0LfAN?fAN?fOOQOAN?_AN?_O$AiQ!0MxOAN?_OOQOAN?OAN?OO%[QlOAN?_OOQO<<Mz<<MzOOQ[G27WG27WO!&zQMhOG27WO#'{Q`OG27WO'.|Q!fOG27WO4UQ!fOG27WO'/TQ`OG27WO'/]Q?MtO<<JgO'/jQ?MvO1G2aO'1`Q?MvO,5?bO'3cQ?MvO,5?dO'5fQ?MvO1G2tO'7iQ?MvO1G2vO'9lQ?MtO<<KYO'9yQ?MtO<<I{OOQO1G1x1G1xO!,TQMhOANAjOOQO7+*d7+*dO':WQ`O7+*dO':cQ`O<= iO':kQ!dO7+*fOOQ!0Lb<<Kr<<KrO$*zQ`O<<KrOCwQ`O<<KrO':uQ`O<<KrO!&zQMhO<<KrOOQ!0Lb<<Kp<<KpO!CZQpO<<KpO';QQ!dO<<KrOOQ!0Lb<<Kq<<KqO';[Q`O<<KrO!&zQMhO<<KrO$*zQ`O<<KqO';aQMjOANDdO';kQ!0MvO<<KuOOQO7+*s7+*sO9kQ`O7+*sO';{Q`O<= rOOQ[G27sG27sO9uQ!0LrOG27sO@zQ`OG27sO!)[QlO1G5TO'<TQ`O7+,TO'<]Q`O1G2lO&<wQ`OANBROOQ[ANBRANBRO!&zQMhOANBRO'<bQ`OANBROOQ[ANBTANBTO9uQ!0LrOANBTO$%UQ`OANBTOOQO'#H`'#H`OOQO7+*r7+*rOOQ[G22wG22wOOQ[ANE_ANE_OOQ[ANE`ANE`OOQ[ANB^ANB^O'<jQ`OANB^OOQ[<<MX<<MXO!)[QlOAN?lOOQOG24yG24yO$AiQ!0MxOG24yO#'{Q`OLD,rOOQ[LD,rLD,rO!&zQMhOLD,rO'<oQ!fOLD,rO'<vQ?MvO7+'{O'>lQ?MvO,5?bO'@oQ?MvO,5?dO'BrQ?MvO7+'}O'DhQMjOG27UOOQO<<NO<<NOOOQ!0LbANA^ANA^O$*zQ`OANA^OCwQ`OANA^O'DxQ!dOANA^OOQ!0LbANA[ANA[O'EPQ`OANA^O!&zQMhOANA^O'E[Q!dOANA^OOQ!0LbANA]ANA]OOQO<<N_<<N_OOQ[LD-_LD-_O9uQ!0LrOLD-_O'EfQ?MtO7+*oOOQO'#Gg'#GgOOQ[G27mG27mO&<wQ`OG27mO!&zQMhOG27mOOQ[G27oG27oO9uQ!0LrOG27oOOQ[G27xG27xO'EpQ?MtOG25WOOQOLD*eLD*eOOQ[!$(!^!$(!^O#'{Q`O!$(!^O!&zQMhO!$(!^O'EzQ!0MzOG27UOOQ!0LbG26xG26xO$*zQ`OG26xO'H]Q`OG26xOCwQ`OG26xO'HhQ!dOG26xO!&zQMhOG26xOOQ[!$(!y!$(!yOOQ[LD-XLD-XO&<wQ`OLD-XOOQ[LD-ZLD-ZOOQ[!)9Ex!)9ExO#'{Q`O!)9ExOOQ!0LbLD,dLD,dO$*zQ`OLD,dOCwQ`OLD,dO'HoQ`OLD,dO'HzQ!dOLD,dOOQ[!$(!s!$(!sOOQ[!.K;d!.K;dO'IRQ?MvOG27UOOQ!0Lb!$(!O!$(!OO$*zQ`O!$(!OOCwQ`O!$(!OO'JwQ`O!$(!OOOQ!0Lb!)9Ej!)9EjO$*zQ`O!)9EjOCwQ`O!)9EjOOQ!0Lb!.K;U!.K;UO$*zQ`O!.K;UOOQ!0Lb!4/0p!4/0pO!)[QlO'#DzO1PQ`O'#EXO'KSQ!fO'#JsO'KZQ!L^O'#DvO'KbQlO'#EOO'KiQ!fO'#CiO'NPQ!fO'#CiO!)[QlO'#EQO'NaQlO,5;ZO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO,5;fO!)[QlO'#IqO(!dQ`O,5<jO!)[QlO,5;fO(!lQMhO,5;fO($VQMhO,5;fO!)[QlO,5;xO!&zQMhO'#GnO(!lQMhO'#GnO!&zQMhO'#GpO(!lQMhO'#GpO1SQ`O'#DZO1SQ`O'#DZO!&zQMhO'#GQO(!lQMhO'#GQO!&zQMhO'#GSO(!lQMhO'#GSO!&zQMhO'#GbO(!lQMhO'#GbO!)[QlO,5:jO($^QpO'#D_O!)[QlO,5@pO'NaQlO1G0uO($hQ?MtO'#CiO!)[QlO1G2QO!&zQMhO'#IvO(!lQMhO'#IvO!&zQMhO'#IxO(!lQMhO'#IxO($rQ!dO'#CrO!&zQMhO,5<uO(!lQMhO,5<uO'NaQlO1G2SO!)[QlO7+&{O!&zQMhO1G2aO(!lQMhO1G2aO!&zQMhO'#IvO(!lQMhO'#IvO!&zQMhO'#IxO(!lQMhO'#IxO!&zQMhO1G2cO(!lQMhO1G2cO'NaQlO7+'nO'NaQlO7+&aO!&zQMhOANAjO(!lQMhOANAjO(%VQ`O'#EoO(%[Q`O'#EoO(%dQ`O'#F^O(%iQ`O'#EzO(%nQ`O'#KUO(%yQ`O'#KSO(&UQ`O,5;ZO(&ZQMjO,5<fO(&bQ`O'#GZO(&gQ`O'#GZO(&lQ`O,5<fO(&tQ`O,5<hO(&|Q`O,5;ZO('UQ?MtO1G1aO(']Q`O,5<uO('bQ`O,5<uO('gQ`O,5<wO('lQ`O,5<wO('qQ`O1G2SO('vQ`O1G0uO('{QMjO<<LOO((SQMjO<<LOO((ZQMhO'#F}O9`Q`O'#F|OAuQ`O'#EnO!)[QlO,5;uO!3oQ`O'#GZO!3oQ`O'#GZO!3oQ`O'#G]O!3oQ`O'#G]O!,TQMhO7+(dO!,TQMhO7+(dO%.wQ!dO1G2xO%.wQ!dO1G2xO!&zQMhO,5=^O!&zQMhO,5=^",
  stateData: "()a~O'}OS(OOSTOS(PRQ~OPYOQYOSfOY!VOaqOdzOeyOl!POpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_XO!iuO!lZO!oYO!pYO!qYO!svO!uwO!xxO!|]O$X|O$oiO%i}O%k!QO%m!OO%n!OO%o!OO%r!RO%t!SO%w!TO%x!TO%z!UO&X!WO&_!XO&a!YO&c!ZO&e![O&h!]O&n!^O&t!_O&v!`O&x!aO&z!bO&|!cO(USO(WTO(ZUO(bVO(p[O~OWtO~P`OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$X!kO$oiO(U!dO(WTO(ZUO(bVO(p[O~Oa!wOs!nO!S!oO!b!yO!c!vO!d!vO!|<VO#T!pO#U!pO#V!xO#W!pO#X!pO#[!zO#]!zO(V!lO(WTO(ZUO(f!mO(p!sO~O(P!{O~OP]XR]X[]Xa]Xj]Xr]X!Q]X!S]X!]]X!l]X!p]X#R]X#S]X#`]X#lfX#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#w]X#y]X#{]X#|]X$R]X'{]X(b]X(s]X(z]X({]X~O!g%SX~P(qO_!}O(W#PO(X!}O(Y#PO~O_#QO(Y#PO(Z#PO([#QO~Ox#SO!U#TO(c#TO(d#VO~OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$X!kO$oiO(U<ZO(WTO(ZUO(bVO(p[O~O![#ZO!]#WO!Y(iP!Y(wP~P+}O!^#cO~P`OPYOQYOSfOd!jOe!iOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$X!kO$oiO(WTO(ZUO(bVO(p[O~Op#mO![#iO!|]O#j#lO#k#iO(U<[O!k(tP~P.iO!l#oO(U#nO~O!x#sO!|]O%i#tO~O#l#uO~O!g#vO#l#uO~OP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!]$_O!l#xO!p$[O#R$RO#o$OO#p$PO#q$PO#r$PO#s$QO#t$RO#u$RO#v$bO#w$SO#y$UO#{$WO#|$XO(bVO(s$YO(z#|O({#}O~Oa(gX'{(gX'x(gX!k(gX!Y(gX!_(gX%j(gX!g(gX~P1qO#S$dO#`$eO$R$eOP(hXR(hX[(hXj(hXr(hX!Q(hX!S(hX!](hX!l(hX!p(hX#R(hX#o(hX#p(hX#q(hX#r(hX#s(hX#t(hX#u(hX#v(hX#w(hX#y(hX#{(hX#|(hX(b(hX(s(hX(z(hX({(hX!_(hX%j(hX~Oa(hX'{(hX'x(hX!Y(hX!k(hXv(hX!g(hX~P4UO#`$eO~O$^$hO$`$gO$g$mO~OSfO!_$nO$j$oO$l$qO~Oh%VOj%dOk%dOp%WOr%XOs$tOt$tOz%YO|%ZO!O%]O!S${O!_$|O!i%bO!l$xO#k%cO$X%`O$u%^O$w%_O$z%aO(U$sO(WTO(ZUO(b$uO(z$}O({%POg(_P~Ol%[O~P7eO!l%eO~O!S%hO!_%iO(U%gO~O!g%mO~Oa%nO'{%nO~O!Q%rO~P%[O(V!lO~P%[O%o%vO~P%[Oh%VO!l%eO(U%gO(V!lO~Oe%}O!l%eO(U%gO~Oj$RO~O!_&PO(U%gO(V!lO(WTO(ZUO`)XP~O!Q&SO!l&RO%k&VO&U&WO~P;SO!x#sO~O%t&YO!S)TX!_)TX(U)TX~O(U&ZO~Ol!PO!u&`O%k!QO%m!OO%n!OO%o!OO%r!RO%t!SO%w!TO%x!TO~Od&eOe&dO!x&bO%i&cO%|&aO~P<bOd&hOeyOl!PO!_&gO!u&`O!xxO!|]O%i}O%m!OO%n!OO%o!OO%r!RO%t!SO%w!TO%x!TO%z!UO~Ob&kO#`&nO%k&iO(V!lO~P=gO!l&oO!u&sO~O!l#oO~O!_XO~Oa%nO'y&{O'{%nO~Oa%nO'y'OO'{%nO~Oa%nO'y'QO'{%nO~O'x]X!Y]Xv]X!k]X&]]X!_]X%j]X!g]X~P(qO!b'`O!c'WO!d'WO(V!lO(WTO(ZUO~Os'UO!S'TO!['XO(f'SO!^(jP!^(yP~P@nOn'cO!_'aO(U%gO~Oe'hO!l%eO(U%gO~O!Q&SO!l&RO~Os!nO!S!oO!|<VO#T!pO#U!pO#W!pO#X!pO(V!lO(WTO(ZUO(f!mO(p!sO~O!b'nO!c'mO!d'mO#V!pO#['oO#]'oO~PBYOa%nOh%VO!g#vO!l%eO'{%nO(s'qO~O!p'uO#`'sO~PChOs!nO!S!oO(WTO(ZUO(f!mO(p!sO~O!_XOs(nX!S(nX!b(nX!c(nX!d(nX!|(nX#T(nX#U(nX#V(nX#W(nX#X(nX#[(nX#](nX(V(nX(W(nX(Z(nX(f(nX(p(nX~O!c'mO!d'mO(V!lO~PDWO(Q'yO(R'yO(S'{O~O_!}O(W'}O(X!}O(Y'}O~O_#QO(Y'}O(Z'}O([#QO~Ov(PO~P%[Ox#SO!U#TO(c#TO(d(SO~O![(UO!Y'XX!Y'_X!]'XX!]'_X~P+}O!](WO!Y(iX~OP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!](WO!l#xO!p$[O#R$RO#o$OO#p$PO#q$PO#r$PO#s$QO#t$RO#u$RO#v$bO#w$SO#y$UO#{$WO#|$XO(bVO(s$YO(z#|O({#}O~O!Y(iX~PHRO!Y(]O~O!Y(vX!](vX!g(vX!k(vX(s(vX~O#`(vX#l#dX!^(vX~PJUO#`(^O!Y(xX!](xX~O!](_O!Y(wX~O!Y(bO~O#`$eO~PJUO!^(cO~P`OR#zO!Q#yO!S#{O!l#xO(bVOP!na[!naj!nar!na!]!na!p!na#R!na#o!na#p!na#q!na#r!na#s!na#t!na#u!na#v!na#w!na#y!na#{!na#|!na(s!na(z!na({!na~Oa!na'{!na'x!na!Y!na!k!nav!na!_!na%j!na!g!na~PKlO!k(dO~O!g#vO#`(eO(s'qO!](uXa(uX'{(uX~O!k(uX~PNXO!S%hO!_%iO!|]O#j(jO#k(iO(U%gO~O!](kO!k(tX~O!k(mO~O!S%hO!_%iO#k(iO(U%gO~OP(hXR(hX[(hXj(hXr(hX!Q(hX!S(hX!](hX!l(hX!p(hX#R(hX#o(hX#p(hX#q(hX#r(hX#s(hX#t(hX#u(hX#v(hX#w(hX#y(hX#{(hX#|(hX(b(hX(s(hX(z(hX({(hX~O!g#vO!k(hX~P! uOR(oO!Q(nO!l#xO#S$dO!|!{a!S!{a~O!x!{a%i!{a!_!{a#j!{a#k!{a(U!{a~P!#vO!x(sO~OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_XO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$X!kO$oiO(U!dO(WTO(ZUO(bVO(p[O~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<sO!S${O!_$|O!i>UO!l$xO#k<yO$X%`O$u<uO$w<wO$z%aO(U(wO(WTO(ZUO(b$uO(z$}O({%PO~O#l(yO~O![({O!k(lP~P%[O(f(}O(p[O~O!S)PO!l#xO(f(}O(p[O~OP<UOQ<UOSfOd>QOe!iOpkOr<UOskOtkOzkO|<UO!O<UO!SWO!WkO!XkO!_!eO!i<XO!lZO!o<UO!p<UO!q<UO!s<YO!u<]O!x!hO$X!kO$o>OO(U)^O(WTO(ZUO(bVO(p[O~O!]$_Oa$ra'{$ra'x$ra!k$ra!Y$ra!_$ra%j$ra!g$ra~Ol)eO~P!&zOh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O%]O!S${O!_$|O!i%bO!l$xO#k%cO$X%`O$u%^O$w%_O$z%aO(U(wO(WTO(ZUO(b$uO(z$}O({%PO~Og(qP~P!,TO!Q)jO!g)iO!_$_X$[$_X$^$_X$`$_X$g$_X~O!g)iO!_(|X$[(|X$^(|X$`(|X$g(|X~O!Q)jO~P!.^O!Q)jO!_(|X$[(|X$^(|X$`(|X$g(|X~O!_)lO$[)pO$^)kO$`)kO$g)qO~O![)tO~P!)[O$^$hO$`$gO$g)xO~On${X!Q${X#S${X'z${X(z${X({${X~OgmXg${XnmX!]mX#`mX~P!0SOx)zO(c){O(d)}O~On*WO!Q*PO'z*QO(z$}O({%PO~Og*OO~P!1WOg*XO~Oh%VOr%XOs$tOt$tOz%YO|%ZO!O<sO!S*ZO!_*[O!i>UO!l$xO#k<yO$X%`O$u<uO$w<wO$z%aO(WTO(ZUO(b$uO(z$}O({%PO~Op*aO![*_O(U*YO!k)PP~P!1uO#l*bO~O!l*cO~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<sO!S${O!_$|O!i>UO!l$xO#k<yO$X%`O$u<uO$w<wO$z%aO(U*eO(WTO(ZUO(b$uO(z$}O({%PO~O![*hO!Y)QP~P!3tOr*tOs!nO!S*jO!b*rO!c*lO!d*lO!l*cO#[*sO%a*nO(V!lO(WTO(ZUO(f!mO~O!^*qO~P!5iO#S$dOn(aX!Q(aX'z(aX(z(aX({(aX!](aX#`(aX~Og(aX$P(aX~P!6kOn*yO#`*xOg(`X!](`X~O!]*zOg(_X~Oj%dOk%dOl%dO(U&ZOg(_P~Os*}O~Og*OO(U&ZO~O!l+TO~O(U(wO~Op+XO!S%hO![#iO!_%iO!|]O#j#lO#k#iO(U%gO!k(tP~O!g#vO#l+YO~O!S%hO![+[O!](_O!_%iO(U%gO!Y(wP~Os']O!S+_O![+^O(WTO(ZUO(f+]O~O!^(yP~P!9|O!]+`Oa)UX'{)UX~OP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#o$OO#p$PO#q$PO#r$PO#s$QO#t$RO#u$RO#v$bO#w$SO#y$UO#{$WO#|$XO(bVO(s$YO(z#|O({#}O~Oa!ja!]!ja'{!ja'x!ja!Y!ja!k!jav!ja!_!ja%j!ja!g!ja~P!:tO(f(}O~OR#zO!Q#yO!S#{O!l#xO(bVOP!ra[!raj!rar!ra!]!ra!p!ra#R!ra#o!ra#p!ra#q!ra#r!ra#s!ra#t!ra#u!ra#v!ra#w!ra#y!ra#{!ra#|!ra(s!ra(z!ra({!ra~Oa!ra'{!ra'x!ra!Y!ra!k!rav!ra!_!ra%j!ra!g!ra~P!=aOR#zO!Q#yO!S#{O!l#xO(bVOP!ta[!taj!tar!ta!]!ta!p!ta#R!ta#o!ta#p!ta#q!ta#r!ta#s!ta#t!ta#u!ta#v!ta#w!ta#y!ta#{!ta#|!ta(s!ta(z!ta({!ta~Oa!ta'{!ta'x!ta!Y!ta!k!tav!ta!_!ta%j!ta!g!ta~P!?wOh%VOn+iO!_'aO%j+hO~O!g+kOa(^X!_(^X'{(^X!](^X~Oa%nO!_XO'{%nO~Oh%VO!l%eO~Oh%VO!l%eO(U%gO~O!g#vO#l(yO~Ob+vO%k+wO(U+sO(WTO(ZUO!^)YP~O!]+xO`)XX~O[+|O~O`+}O~O!_&PO(U%gO(V!lO`)XP~O%k,QO~P;SOh%VO#`,UO~Oh%VOn,XO!_$|O~O!_,ZO~O!Q,]O!_XO~O%o%vO~O!x,bO~Oe,gO~Ob,hO(U#nO(WTO(ZUO!^)WP~Oe%}O~O%k!QO(U&ZO~P=gO[,mO`,lO~OPYOQYOSfOdzOeyOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!iuO!lZO!oYO!pYO!qYO!svO!xxO!|]O$oiO%i}O(WTO(ZUO(bVO(p[O~O!_!eO!u!gO$X!kO(U!dO~P!GOO`,lOa%nO'{%nO~OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!x!hO$X!kO$oiO(U!dO(WTO(ZUO(bVO(p[O~Oa,rOl!OO!uwO%m!OO%n!OO%o!OO~P!IhO!l&oO~O&_,xO~O!_,zO~O&p,|O&r,}OP&maQ&maS&maY&maa&mad&mae&mal&map&mar&mas&mat&maz&ma|&ma!O&ma!S&ma!W&ma!X&ma!_&ma!i&ma!l&ma!o&ma!p&ma!q&ma!s&ma!u&ma!x&ma!|&ma$X&ma$o&ma%i&ma%k&ma%m&ma%n&ma%o&ma%r&ma%t&ma%w&ma%x&ma%z&ma&X&ma&_&ma&a&ma&c&ma&e&ma&h&ma&n&ma&t&ma&v&ma&x&ma&z&ma&|&ma'x&ma(U&ma(W&ma(Z&ma(b&ma(p&ma!^&ma&f&mab&ma&k&ma~O(U-SO~Oh!eX!]#iX!^#iX!g!RX!g!eX!l!eX~O!]!eX!^!eX~P#!nO!g-WOh(kX!](kX!^(kX!g(kX!l(kXr(kX(s(kX~Oh%VO!g-YO!l%eO!]!aX!^!aX~Os!nO!S!oO(WTO(ZUO(f!mO~OP<UOQ<UOSfOd>QOe!iOpkOr<UOskOtkOzkO|<UO!O<UO!SWO!WkO!XkO!_!eO!i<XO!lZO!o<UO!p<UO!q<UO!s<YO!u<]O!x!hO$X!kO$o>OO(WTO(ZUO(bVO(p[O~O(U=PO~P#$lO!]-^O!^(jX~O!^-`O~O!g-WO~O!]-aO!^(yX~O!^-cO~O!c-dO!d-dO(V!lO~P#$ZO!^-gO~P'_On-jO!_'aO~O!Y-oO~Os!{a!b!{a!c!{a!d!{a#T!{a#U!{a#V!{a#W!{a#X!{a#[!{a#]!{a(V!{a(W!{a(Z!{a(f!{a(p!{a~P!#vO!p-tO#`-rO~PChO!c-vO!d-vO(V!lO~PDWOa%nO#`-rO'{%nO~Oa%nO!g#vO#`-rO'{%nO~Oa%nO!g#vO!p-tO#`-rO'{%nO(s'qO~O(Q'yO(R'yO(S-{O~Ov-|O~O!Y'Xa!]'Xa~P!:tO![.QO!Y'XX!]'XX~P%[O!](WO!Y(ia~O!Y(ia~PHRO!](_O!Y(wa~O!S%hO![.UO!_%iO(U%gO!Y'_X!]'_X~O#`.WO!](ua!k(uaa(ua'{(ua~O!g#vO~P#,iO!](kO!k(ta~O!S%hO!_%iO#k.[O(U%gO~Op.aO!S%hO![.^O!_%iO!|]O#j.`O#k.^O(U%gO!]'bX!k'bX~OR.eO!l#xO~Oh%VOn.hO!_'aO%j.gO~Oa#ci!]#ci'{#ci'x#ci!Y#ci!k#civ#ci!_#ci%j#ci!g#ci~P!:tOn>[O!Q*PO'z*QO(z$}O({%PO~O#l#_aa#_a#`#_a'{#_a!]#_a!k#_a!_#_a!Y#_a~P#/eO#l(aXP(aXR(aX[(aXa(aXj(aXr(aX!S(aX!l(aX!p(aX#R(aX#o(aX#p(aX#q(aX#r(aX#s(aX#t(aX#u(aX#v(aX#w(aX#y(aX#{(aX#|(aX'{(aX(b(aX(s(aX!k(aX!Y(aX'x(aXv(aX!_(aX%j(aX!g(aX~P!6kO!].uO!k(lX~P!:tO!k.xO~O!Y.zO~OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O(bVO[#nia#nij#nir#ni!]#ni#R#ni#p#ni#q#ni#r#ni#s#ni#t#ni#u#ni#v#ni#w#ni#y#ni#{#ni#|#ni'{#ni(s#ni(z#ni({#ni'x#ni!Y#ni!k#niv#ni!_#ni%j#ni!g#ni~O#o#ni~P#3TO#o$OO~P#3TOP$[OR#zOr$aO!Q#yO!S#{O!l#xO!p$[O#o$OO#p$PO#q$PO#r$PO(bVO[#nia#nij#ni!]#ni#R#ni#t#ni#u#ni#v#ni#w#ni#y#ni#{#ni#|#ni'{#ni(s#ni(z#ni({#ni'x#ni!Y#ni!k#niv#ni!_#ni%j#ni!g#ni~O#s#ni~P#5rO#s$QO~P#5rOP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#o$OO#p$PO#q$PO#r$PO#s$QO#t$RO#u$RO#v$bO(bVOa#ni!]#ni#y#ni#{#ni#|#ni'{#ni(s#ni(z#ni({#ni'x#ni!Y#ni!k#niv#ni!_#ni%j#ni!g#ni~O#w#ni~P#8aOP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#o$OO#p$PO#q$PO#r$PO#s$QO#t$RO#u$RO#v$bO#w$SO(bVO({#}Oa#ni!]#ni#{#ni#|#ni'{#ni(s#ni(z#ni'x#ni!Y#ni!k#niv#ni!_#ni%j#ni!g#ni~O#y$UO~P#:wO#y#ni~P#:wO#w$SO~P#8aOP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#o$OO#p$PO#q$PO#r$PO#s$QO#t$RO#u$RO#v$bO#w$SO#y$UO(bVO(z#|O({#}Oa#ni!]#ni#|#ni'{#ni(s#ni'x#ni!Y#ni!k#niv#ni!_#ni%j#ni!g#ni~O#{#ni~P#=mO#{$WO~P#=mOP]XR]X[]Xj]Xr]X!Q]X!S]X!l]X!p]X#R]X#S]X#`]X#lfX#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#w]X#y]X#{]X#|]X$R]X(b]X(s]X(z]X({]X!]]X!^]X~O$P]X~P#@[OP$[OR#zO[<mOj<bOr<kO!Q#yO!S#{O!l#xO!p$[O#R<bO#o<_O#p<`O#q<`O#r<`O#s<aO#t<bO#u<bO#v<lO#w<cO#y<eO#{<gO#|<hO(bVO(s$YO(z#|O({#}O~O$P.|O~P#BiO#S$dO#`<nO$R<nO$P(hX!^(hX~P! uOa'ea!]'ea'{'ea'x'ea!k'ea!Y'eav'ea!_'ea%j'ea!g'ea~P!:tO[#nia#nij#nir#ni!]#ni#R#ni#s#ni#t#ni#u#ni#v#ni#w#ni#y#ni#{#ni#|#ni'{#ni(s#ni'x#ni!Y#ni!k#niv#ni!_#ni%j#ni!g#ni~OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O#o$OO#p$PO#q$PO#r$PO(bVO(z#ni({#ni~P#EkOn>[O!Q*PO'z*QO(z$}O({%POP#niR#ni!S#ni!l#ni!p#ni#o#ni#p#ni#q#ni#r#ni(b#ni~P#EkO!]/QOg(qX~P!1WOg/SO~Oa$Qi!]$Qi'{$Qi'x$Qi!Y$Qi!k$Qiv$Qi!_$Qi%j$Qi!g$Qi~P!:tO$^/TO$`/TO~O$^/UO$`/UO~O!g)iO#`/VO!_$dX$[$dX$^$dX$`$dX$g$dX~O![/WO~O!_)lO$[/YO$^)kO$`)kO$g/ZO~O!]<iO!^(gX~P#BiO!^/[O~O!g)iO$g(|X~O$g/^O~Ov/_O~P!&zOx)zO(c){O(d/bO~O!S/eO~O(z$}On%ba!Q%ba'z%ba({%ba!]%ba#`%ba~Og%ba$P%ba~P#LmO({%POn%da!Q%da'z%da(z%da!]%da#`%da~Og%da$P%da~P#M`O!]fX!gfX!kfX!k${X(sfX~P!0SOp%WO![/nO!](_O(U/mO!Y(wP!Y)QP~P!1uOr*tO!b*rO!c*lO!d*lO!l*cO#[*sO%a*nO(V!lO(WTO(ZUO~Os'UO!S/oO![+^O!^*qO(f<|O!^(yP~P#N|O!k/pO~P#/eO!]/qO!g#vO(s'qO!k)PX~O!k/vO~OnoX!QoX'zoX(zoX({oX~O!g#vO!koX~P$!pOp/xO!S%hO![*_O!_%iO(U%gO!k)PP~O#l/yO~O!Y${X!]${X!g%SX~P!0SO!]/zO!Y)QX~P#/eO!g/|O~O!Y0OO~OpkO(U0PO~P.iOh%VOr0UO!g#vO!l%eO(s'qO~O!g+kO~Oa%nO!]0YO'{%nO~O!^0[O~P!5iO!c0]O!d0]O(V!lO~P#$ZOs!nO!S0^O(WTO(ZUO(f!mO~O#[0`O~Og%ba!]%ba#`%ba$P%ba~P!1WOg%da!]%da#`%da$P%da~P!1WOj%dOk%dOl%dO(U&ZOg'nX!]'nX~O!]*zOg(_a~Og0iO~On0kO#`0jOg(`a!](`a~OR0lO!Q0lO!S0mO#S$dOn}a'z}a(z}a({}a!]}a#`}a~Og}a$P}a~P$(TO!Q*PO'z*QOn$ta(z$ta({$ta!]$ta#`$ta~Og$ta$P$ta~P$)PO!Q*PO'z*QOn$va(z$va({$va!]$va#`$va~Og$va$P$va~P$)rO#l0pO~Og%Ua!]%Ua#`%Ua$P%Ua~P!1WO!g#vO~O#l0sO~O!]#iX!^#iX!g!RX~O!]+`Oa)Ua'{)Ua~OR#zO!Q#yO!S#{O!l#xO(bVOP!ri[!rij!rir!ri!]!ri!p!ri#R!ri#o!ri#p!ri#q!ri#r!ri#s!ri#t!ri#u!ri#v!ri#w!ri#y!ri#{!ri#|!ri(s!ri(z!ri({!ri~Oa!ri'{!ri'x!ri!Y!ri!k!riv!ri!_!ri%j!ri!g!ri~P$+lOh%VOr%XOs$tOt$tOz%YO|%ZO!O<sO!S${O!_$|O!i>UO!l$xO#k<yO$X%`O$u<uO$w<wO$z%aO(WTO(ZUO(b$uO(z$}O({%PO~Op0|O%^0}O(U0{O~P$.SO!g+kOa(^a!_(^a'{(^a!](^a~O#l1TO~O[]X!]fX!^fX~O!]1UO!^)YX~O!^1WO~O[1XO~Ob1ZO(U+sO(WTO(ZUO~O!_&PO(U%gO`'vX!]'vX~O!]+xO`)Xa~O!k1^O~P!:tO[1aO~O`1bO~O#`1gO~On1jO!_$|O~O(f(}O!^)VP~Oh%VOn1sO!_1pO%j1rO~O[1}O!]1{O!^)WX~O!^2OO~O`2QOa%nO'{%nO~O(U#nO(WTO(ZUO~O#S$dO#`$eO$R$eOP(hXR(hX[(hXr(hX!Q(hX!S(hX!](hX!l(hX!p(hX#R(hX#o(hX#p(hX#q(hX#r(hX#s(hX#t(hX#u(hX#v(hX#w(hX#y(hX#{(hX#|(hX(b(hX(s(hX(z(hX({(hX~Oj2TO&]2UOa(hX~P$3mOj2TO#`$eO&]2UO~Oa2WO~P%[Oa2YO~O&f2]OP&diQ&diS&diY&dia&did&die&dil&dip&dir&dis&dit&diz&di|&di!O&di!S&di!W&di!X&di!_&di!i&di!l&di!o&di!p&di!q&di!s&di!u&di!x&di!|&di$X&di$o&di%i&di%k&di%m&di%n&di%o&di%r&di%t&di%w&di%x&di%z&di&X&di&_&di&a&di&c&di&e&di&h&di&n&di&t&di&v&di&x&di&z&di&|&di'x&di(U&di(W&di(Z&di(b&di(p&di!^&dib&di&k&di~Ob2cO!^2aO&k2bO~P`O!_XO!l2eO~O&r,}OP&miQ&miS&miY&mia&mid&mie&mil&mip&mir&mis&mit&miz&mi|&mi!O&mi!S&mi!W&mi!X&mi!_&mi!i&mi!l&mi!o&mi!p&mi!q&mi!s&mi!u&mi!x&mi!|&mi$X&mi$o&mi%i&mi%k&mi%m&mi%n&mi%o&mi%r&mi%t&mi%w&mi%x&mi%z&mi&X&mi&_&mi&a&mi&c&mi&e&mi&h&mi&n&mi&t&mi&v&mi&x&mi&z&mi&|&mi'x&mi(U&mi(W&mi(Z&mi(b&mi(p&mi!^&mi&f&mib&mi&k&mi~O!Y2kO~O!]!aa!^!aa~P#BiOs!nO!S!oO![2pO(f!mO!]'YX!^'YX~P@nO!]-^O!^(ja~O!]'`X!^'`X~P!9|O!]-aO!^(ya~O!^2wO~P'_Oa%nO#`3QO'{%nO~Oa%nO!g#vO#`3QO'{%nO~Oa%nO!g#vO!p3UO#`3QO'{%nO(s'qO~Oa%nO'{%nO~P!:tO!]$_Ov$ra~O!Y'Xi!]'Xi~P!:tO!](WO!Y(ii~O!](_O!Y(wi~O!Y(xi!](xi~P!:tO!](ui!k(uia(ui'{(ui~P!:tO#`3WO!](ui!k(uia(ui'{(ui~O!](kO!k(ti~O!S%hO!_%iO!|]O#j3]O#k3[O(U%gO~O!S%hO!_%iO#k3[O(U%gO~On3dO!_'aO%j3cO~Oh%VOn3dO!_'aO%j3cO~O#l%baP%baR%ba[%baa%baj%bar%ba!S%ba!l%ba!p%ba#R%ba#o%ba#p%ba#q%ba#r%ba#s%ba#t%ba#u%ba#v%ba#w%ba#y%ba#{%ba#|%ba'{%ba(b%ba(s%ba!k%ba!Y%ba'x%bav%ba!_%ba%j%ba!g%ba~P#LmO#l%daP%daR%da[%daa%daj%dar%da!S%da!l%da!p%da#R%da#o%da#p%da#q%da#r%da#s%da#t%da#u%da#v%da#w%da#y%da#{%da#|%da'{%da(b%da(s%da!k%da!Y%da'x%dav%da!_%da%j%da!g%da~P#M`O#l%baP%baR%ba[%baa%baj%bar%ba!S%ba!]%ba!l%ba!p%ba#R%ba#o%ba#p%ba#q%ba#r%ba#s%ba#t%ba#u%ba#v%ba#w%ba#y%ba#{%ba#|%ba'{%ba(b%ba(s%ba!k%ba!Y%ba'x%ba#`%bav%ba!_%ba%j%ba!g%ba~P#/eO#l%daP%daR%da[%daa%daj%dar%da!S%da!]%da!l%da!p%da#R%da#o%da#p%da#q%da#r%da#s%da#t%da#u%da#v%da#w%da#y%da#{%da#|%da'{%da(b%da(s%da!k%da!Y%da'x%da#`%dav%da!_%da%j%da!g%da~P#/eO#l}aP}a[}aa}aj}ar}a!l}a!p}a#R}a#o}a#p}a#q}a#r}a#s}a#t}a#u}a#v}a#w}a#y}a#{}a#|}a'{}a(b}a(s}a!k}a!Y}a'x}av}a!_}a%j}a!g}a~P$(TO#l$taP$taR$ta[$taa$taj$tar$ta!S$ta!l$ta!p$ta#R$ta#o$ta#p$ta#q$ta#r$ta#s$ta#t$ta#u$ta#v$ta#w$ta#y$ta#{$ta#|$ta'{$ta(b$ta(s$ta!k$ta!Y$ta'x$tav$ta!_$ta%j$ta!g$ta~P$)PO#l$vaP$vaR$va[$vaa$vaj$var$va!S$va!l$va!p$va#R$va#o$va#p$va#q$va#r$va#s$va#t$va#u$va#v$va#w$va#y$va#{$va#|$va'{$va(b$va(s$va!k$va!Y$va'x$vav$va!_$va%j$va!g$va~P$)rO#l%UaP%UaR%Ua[%Uaa%Uaj%Uar%Ua!S%Ua!]%Ua!l%Ua!p%Ua#R%Ua#o%Ua#p%Ua#q%Ua#r%Ua#s%Ua#t%Ua#u%Ua#v%Ua#w%Ua#y%Ua#{%Ua#|%Ua'{%Ua(b%Ua(s%Ua!k%Ua!Y%Ua'x%Ua#`%Uav%Ua!_%Ua%j%Ua!g%Ua~P#/eOa#cq!]#cq'{#cq'x#cq!Y#cq!k#cqv#cq!_#cq%j#cq!g#cq~P!:tO![3lO!]'ZX!k'ZX~P%[O!].uO!k(la~O!].uO!k(la~P!:tO!Y3oO~O$P!na!^!na~PKlO$P!ja!]!ja!^!ja~P#BiO$P!ra!^!ra~P!=aO$P!ta!^!ta~P!?wOg'^X!]'^X~P!,TO!]/QOg(qa~OSfO!_4TO$e4UO~O!^4YO~Ov4ZO~P#/eOa$nq!]$nq'{$nq'x$nq!Y$nq!k$nqv$nq!_$nq%j$nq!g$nq~P!:tO!Y4]O~P!&zO!S4^O~O!Q*PO'z*QO({%POn'ja(z'ja!]'ja#`'ja~Og'ja$P'ja~P%-cO!Q*PO'z*QOn'la(z'la({'la!]'la#`'la~Og'la$P'la~P%.UO(s$YO~P#/eO!YfX!Y${X!]fX!]${X!g%SX#`fX~P!0SOp%WO(U=VO~P!1uOp4bO!S%hO![4aO!_%iO(U%gO!]'fX!k'fX~O!]/qO!k)Pa~O!]/qO!g#vO!k)Pa~O!]/qO!g#vO(s'qO!k)Pa~Og$}i!]$}i#`$}i$P$}i~P!1WO![4jO!Y'hX!]'hX~P!3tO!]/zO!Y)Qa~O!]/zO!Y)Qa~P#/eOP]XR]X[]Xj]Xr]X!Q]X!S]X!Y]X!]]X!l]X!p]X#R]X#S]X#`]X#lfX#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#w]X#y]X#{]X#|]X$R]X(b]X(s]X(z]X({]X~Oj%ZX!g%ZX~P%1{Oj4oO!g#vO~Oh%VO!g#vO!l%eO~Oh%VOr4tO!l%eO(s'qO~Or4yO!g#vO(s'qO~Os!nO!S4zO(WTO(ZUO(f!mO~O(z$}On%bi!Q%bi'z%bi({%bi!]%bi#`%bi~Og%bi$P%bi~P%5lO({%POn%di!Q%di'z%di(z%di!]%di#`%di~Og%di$P%di~P%6_Og(`i!](`i~P!1WO#`5QOg(`i!](`i~P!1WO!k5VO~Oa$pq!]$pq'{$pq'x$pq!Y$pq!k$pqv$pq!_$pq%j$pq!g$pq~P!:tO!Y5ZO~O!]5[O!_)RX~P#/eOa${X!_${X%_]X'{${X!]${X~P!0SO%_5_OaoX!_oX'{oX!]oX~P$!pOp5`O(U#nO~O%_5_O~Ob5fO%k5gO(U+sO(WTO(ZUO!]'uX!^'uX~O!]1UO!^)Ya~O[5kO~O`5lO~O[5pO~Oa%nO'{%nO~P#/eO!]5uO#`5wO!^)VX~O!^5xO~Or6OOs!nO!S*jO!b!yO!c!vO!d!vO!|<VO#T!pO#U!pO#V!pO#W!pO#X!pO#[5}O#]!zO(V!lO(WTO(ZUO(f!mO(p!sO~O!^5|O~P%;bOn6TO!_1pO%j6SO~Oh%VOn6TO!_1pO%j6SO~Ob6[O(U#nO(WTO(ZUO!]'tX!^'tX~O!]1{O!^)Wa~O(WTO(ZUO(f6^O~O`6bO~Oj6eO&]6fO~PNXO!k6gO~P%[Oa6iO~Oa6iO~P%[Ob2cO!^6nO&k2bO~P`O!g6pO~O!g6rOh(ki!](ki!^(ki!g(ki!l(kir(ki(s(ki~O#`6sO!]#hi!^#hi~O!]!ai!^!ai~P#BiOa%nO#`6|O'{%nO~Oa%nO!g#vO#`6|O'{%nO~O!](uq!k(uqa(uq'{(uq~P!:tO!](kO!k(tq~O!S%hO!_%iO#k7TO(U%gO~O!_'aO%j7WO~On7[O!_'aO%j7WO~O#l'jaP'jaR'ja['jaa'jaj'jar'ja!S'ja!l'ja!p'ja#R'ja#o'ja#p'ja#q'ja#r'ja#s'ja#t'ja#u'ja#v'ja#w'ja#y'ja#{'ja#|'ja'{'ja(b'ja(s'ja!k'ja!Y'ja'x'jav'ja!_'ja%j'ja!g'ja~P%-cO#l'laP'laR'la['laa'laj'lar'la!S'la!l'la!p'la#R'la#o'la#p'la#q'la#r'la#s'la#t'la#u'la#v'la#w'la#y'la#{'la#|'la'{'la(b'la(s'la!k'la!Y'la'x'lav'la!_'la%j'la!g'la~P%.UO#l$}iP$}iR$}i[$}ia$}ij$}ir$}i!S$}i!]$}i!l$}i!p$}i#R$}i#o$}i#p$}i#q$}i#r$}i#s$}i#t$}i#u$}i#v$}i#w$}i#y$}i#{$}i#|$}i'{$}i(b$}i(s$}i!k$}i!Y$}i'x$}i#`$}iv$}i!_$}i%j$}i!g$}i~P#/eO#l%biP%biR%bi[%bia%bij%bir%bi!S%bi!l%bi!p%bi#R%bi#o%bi#p%bi#q%bi#r%bi#s%bi#t%bi#u%bi#v%bi#w%bi#y%bi#{%bi#|%bi'{%bi(b%bi(s%bi!k%bi!Y%bi'x%biv%bi!_%bi%j%bi!g%bi~P%5lO#l%diP%diR%di[%dia%dij%dir%di!S%di!l%di!p%di#R%di#o%di#p%di#q%di#r%di#s%di#t%di#u%di#v%di#w%di#y%di#{%di#|%di'{%di(b%di(s%di!k%di!Y%di'x%div%di!_%di%j%di!g%di~P%6_O!]'Za!k'Za~P!:tO!].uO!k(li~O$P#ci!]#ci!^#ci~P#BiOP$[OR#zO!Q#yO!S#{O!l#xO!p$[O(bVO[#nij#nir#ni#R#ni#p#ni#q#ni#r#ni#s#ni#t#ni#u#ni#v#ni#w#ni#y#ni#{#ni#|#ni$P#ni(s#ni(z#ni({#ni!]#ni!^#ni~O#o#ni~P%NVO#o<_O~P%NVOP$[OR#zOr<kO!Q#yO!S#{O!l#xO!p$[O#o<_O#p<`O#q<`O#r<`O(bVO[#nij#ni#R#ni#t#ni#u#ni#v#ni#w#ni#y#ni#{#ni#|#ni$P#ni(s#ni(z#ni({#ni!]#ni!^#ni~O#s#ni~P&!_O#s<aO~P&!_OP$[OR#zO[<mOj<bOr<kO!Q#yO!S#{O!l#xO!p$[O#R<bO#o<_O#p<`O#q<`O#r<`O#s<aO#t<bO#u<bO#v<lO(bVO#y#ni#{#ni#|#ni$P#ni(s#ni(z#ni({#ni!]#ni!^#ni~O#w#ni~P&$gOP$[OR#zO[<mOj<bOr<kO!Q#yO!S#{O!l#xO!p$[O#R<bO#o<_O#p<`O#q<`O#r<`O#s<aO#t<bO#u<bO#v<lO#w<cO(bVO({#}O#{#ni#|#ni$P#ni(s#ni(z#ni!]#ni!^#ni~O#y<eO~P&&hO#y#ni~P&&hO#w<cO~P&$gOP$[OR#zO[<mOj<bOr<kO!Q#yO!S#{O!l#xO!p$[O#R<bO#o<_O#p<`O#q<`O#r<`O#s<aO#t<bO#u<bO#v<lO#w<cO#y<eO(bVO(z#|O({#}O#|#ni$P#ni(s#ni!]#ni!^#ni~O#{#ni~P&(wO#{<gO~P&(wOa#}y!]#}y'{#}y'x#}y!Y#}y!k#}yv#}y!_#}y%j#}y!g#}y~P!:tO[#nij#nir#ni#R#ni#s#ni#t#ni#u#ni#v#ni#w#ni#y#ni#{#ni#|#ni$P#ni(s#ni!]#ni!^#ni~OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O#o<_O#p<`O#q<`O#r<`O(bVO(z#ni({#ni~P&+sOn>]O!Q*PO'z*QO(z$}O({%POP#niR#ni!S#ni!l#ni!p#ni#o#ni#p#ni#q#ni#r#ni(b#ni~P&+sO#S$dOP(aXR(aX[(aXj(aXn(aXr(aX!Q(aX!S(aX!l(aX!p(aX#R(aX#o(aX#p(aX#q(aX#r(aX#s(aX#t(aX#u(aX#v(aX#w(aX#y(aX#{(aX#|(aX$P(aX'z(aX(b(aX(s(aX(z(aX({(aX!](aX!^(aX~O$P$Qi!]$Qi!^$Qi~P#BiO$P!ri!^!ri~P$+lOg'^a!]'^a~P!1WO!^7nO~O!]'ea!^'ea~P#BiO!Y7oO~P#/eO!g#vO(s'qO!]'fa!k'fa~O!]/qO!k)Pi~O!]/qO!g#vO!k)Pi~Og$}q!]$}q#`$}q$P$}q~P!1WO!Y'ha!]'ha~P#/eO!g7vO~O!]/zO!Y)Qi~P#/eO!]/zO!Y)Qi~O!Y7yO~Oh%VOr8OO!l%eO(s'qO~Oj8QO!g#vO~Or8TO!g#vO(s'qO~O!Q*PO'z*QO({%POn'ka(z'ka!]'ka#`'ka~Og'ka$P'ka~P&4tO!Q*PO'z*QOn'ma(z'ma({'ma!]'ma#`'ma~Og'ma$P'ma~P&5gOg(`q!](`q~P!1WO#`8VOg(`q!](`q~P!1WO!Y8WO~Og%Pq!]%Pq#`%Pq$P%Pq~P!1WOa$py!]$py'{$py'x$py!Y$py!k$pyv$py!_$py%j$py!g$py~P!:tO!g6rO~O!]5[O!_)Ra~O!_'aOP$UaR$Ua[$Uaj$Uar$Ua!Q$Ua!S$Ua!]$Ua!l$Ua!p$Ua#R$Ua#o$Ua#p$Ua#q$Ua#r$Ua#s$Ua#t$Ua#u$Ua#v$Ua#w$Ua#y$Ua#{$Ua#|$Ua(b$Ua(s$Ua(z$Ua({$Ua~O%j7WO~P&8XO%_8[Oa%]i!_%]i'{%]i!]%]i~Oa#cy!]#cy'{#cy'x#cy!Y#cy!k#cyv#cy!_#cy%j#cy!g#cy~P!:tO[8^O~Ob8`O(U+sO(WTO(ZUO~O!]1UO!^)Yi~O`8dO~O(f(}O!]'qX!^'qX~O!]5uO!^)Va~O!^8nO~P%;bO(p!sO~P$%zO#[8oO~O!_1pO~O!_1pO%j8qO~On8tO!_1pO%j8qO~O[8yO!]'ta!^'ta~O!]1{O!^)Wi~O!k8}O~O!k9OO~O!k9RO~O!k9RO~P%[Oa9TO~O!g9UO~O!k9VO~O!](xi!^(xi~P#BiOa%nO#`9_O'{%nO~O!](uy!k(uya(uy'{(uy~P!:tO!](kO!k(ty~O%j9bO~P&8XO!_'aO%j9bO~O#l$}qP$}qR$}q[$}qa$}qj$}qr$}q!S$}q!]$}q!l$}q!p$}q#R$}q#o$}q#p$}q#q$}q#r$}q#s$}q#t$}q#u$}q#v$}q#w$}q#y$}q#{$}q#|$}q'{$}q(b$}q(s$}q!k$}q!Y$}q'x$}q#`$}qv$}q!_$}q%j$}q!g$}q~P#/eO#l'kaP'kaR'ka['kaa'kaj'kar'ka!S'ka!l'ka!p'ka#R'ka#o'ka#p'ka#q'ka#r'ka#s'ka#t'ka#u'ka#v'ka#w'ka#y'ka#{'ka#|'ka'{'ka(b'ka(s'ka!k'ka!Y'ka'x'kav'ka!_'ka%j'ka!g'ka~P&4tO#l'maP'maR'ma['maa'maj'mar'ma!S'ma!l'ma!p'ma#R'ma#o'ma#p'ma#q'ma#r'ma#s'ma#t'ma#u'ma#v'ma#w'ma#y'ma#{'ma#|'ma'{'ma(b'ma(s'ma!k'ma!Y'ma'x'mav'ma!_'ma%j'ma!g'ma~P&5gO#l%PqP%PqR%Pq[%Pqa%Pqj%Pqr%Pq!S%Pq!]%Pq!l%Pq!p%Pq#R%Pq#o%Pq#p%Pq#q%Pq#r%Pq#s%Pq#t%Pq#u%Pq#v%Pq#w%Pq#y%Pq#{%Pq#|%Pq'{%Pq(b%Pq(s%Pq!k%Pq!Y%Pq'x%Pq#`%Pqv%Pq!_%Pq%j%Pq!g%Pq~P#/eO!]'Zi!k'Zi~P!:tO$P#cq!]#cq!^#cq~P#BiO(z$}OP%baR%ba[%baj%bar%ba!S%ba!l%ba!p%ba#R%ba#o%ba#p%ba#q%ba#r%ba#s%ba#t%ba#u%ba#v%ba#w%ba#y%ba#{%ba#|%ba$P%ba(b%ba(s%ba!]%ba!^%ba~On%ba!Q%ba'z%ba({%ba~P&IlO({%POP%daR%da[%daj%dar%da!S%da!l%da!p%da#R%da#o%da#p%da#q%da#r%da#s%da#t%da#u%da#v%da#w%da#y%da#{%da#|%da$P%da(b%da(s%da!]%da!^%da~On%da!Q%da'z%da(z%da~P&KsOn>]O!Q*PO'z*QO({%PO~P&IlOn>]O!Q*PO'z*QO(z$}O~P&KsOR0lO!Q0lO!S0mO#S$dOP}a[}aj}an}ar}a!l}a!p}a#R}a#o}a#p}a#q}a#r}a#s}a#t}a#u}a#v}a#w}a#y}a#{}a#|}a$P}a'z}a(b}a(s}a(z}a({}a!]}a!^}a~O!Q*PO'z*QOP$taR$ta[$taj$tan$tar$ta!S$ta!l$ta!p$ta#R$ta#o$ta#p$ta#q$ta#r$ta#s$ta#t$ta#u$ta#v$ta#w$ta#y$ta#{$ta#|$ta$P$ta(b$ta(s$ta(z$ta({$ta!]$ta!^$ta~O!Q*PO'z*QOP$vaR$va[$vaj$van$var$va!S$va!l$va!p$va#R$va#o$va#p$va#q$va#r$va#s$va#t$va#u$va#v$va#w$va#y$va#{$va#|$va$P$va(b$va(s$va(z$va({$va!]$va!^$va~On>]O!Q*PO'z*QO(z$}O({%PO~OP%UaR%Ua[%Uaj%Uar%Ua!S%Ua!l%Ua!p%Ua#R%Ua#o%Ua#p%Ua#q%Ua#r%Ua#s%Ua#t%Ua#u%Ua#v%Ua#w%Ua#y%Ua#{%Ua#|%Ua$P%Ua(b%Ua(s%Ua!]%Ua!^%Ua~P'&xO$P$nq!]$nq!^$nq~P#BiO$P$pq!]$pq!^$pq~P#BiO!^9oO~O$P9pO~P!1WO!g#vO!]'fi!k'fi~O!g#vO(s'qO!]'fi!k'fi~O!]/qO!k)Pq~O!Y'hi!]'hi~P#/eO!]/zO!Y)Qq~Or9wO!g#vO(s'qO~O[9yO!Y9xO~P#/eO!Y9xO~Oj:PO!g#vO~Og(`y!](`y~P!1WO!]'oa!_'oa~P#/eOa%]q!_%]q'{%]q!]%]q~P#/eO[:UO~O!]1UO!^)Yq~O`:YO~O#`:ZO!]'qa!^'qa~O!]5uO!^)Vi~P#BiO!S:]O~O!_1pO%j:`O~O(WTO(ZUO(f:eO~O!]1{O!^)Wq~O!k:hO~O!k:iO~O!k:jO~O!k:jO~P%[O#`:mO!]#hy!^#hy~O!]#hy!^#hy~P#BiO%j:rO~P&8XO!_'aO%j:rO~O$P#}y!]#}y!^#}y~P#BiOP$}iR$}i[$}ij$}ir$}i!S$}i!l$}i!p$}i#R$}i#o$}i#p$}i#q$}i#r$}i#s$}i#t$}i#u$}i#v$}i#w$}i#y$}i#{$}i#|$}i$P$}i(b$}i(s$}i!]$}i!^$}i~P'&xO!Q*PO'z*QO({%POP'jaR'ja['jaj'jan'jar'ja!S'ja!l'ja!p'ja#R'ja#o'ja#p'ja#q'ja#r'ja#s'ja#t'ja#u'ja#v'ja#w'ja#y'ja#{'ja#|'ja$P'ja(b'ja(s'ja(z'ja!]'ja!^'ja~O!Q*PO'z*QOP'laR'la['laj'lan'lar'la!S'la!l'la!p'la#R'la#o'la#p'la#q'la#r'la#s'la#t'la#u'la#v'la#w'la#y'la#{'la#|'la$P'la(b'la(s'la(z'la({'la!]'la!^'la~O(z$}OP%biR%bi[%bij%bin%bir%bi!Q%bi!S%bi!l%bi!p%bi#R%bi#o%bi#p%bi#q%bi#r%bi#s%bi#t%bi#u%bi#v%bi#w%bi#y%bi#{%bi#|%bi$P%bi'z%bi(b%bi(s%bi({%bi!]%bi!^%bi~O({%POP%diR%di[%dij%din%dir%di!Q%di!S%di!l%di!p%di#R%di#o%di#p%di#q%di#r%di#s%di#t%di#u%di#v%di#w%di#y%di#{%di#|%di$P%di'z%di(b%di(s%di(z%di!]%di!^%di~O$P$py!]$py!^$py~P#BiO$P#cy!]#cy!^#cy~P#BiO!g#vO!]'fq!k'fq~O!]/qO!k)Py~O!Y'hq!]'hq~P#/eOr:|O!g#vO(s'qO~O[;QO!Y;PO~P#/eO!Y;PO~Og(`!R!](`!R~P!1WOa%]y!_%]y'{%]y!]%]y~P#/eO!]1UO!^)Yy~O!]5uO!^)Vq~O(U;XO~O!_1pO%j;[O~O!k;_O~O%j;dO~P&8XOP$}qR$}q[$}qj$}qr$}q!S$}q!l$}q!p$}q#R$}q#o$}q#p$}q#q$}q#r$}q#s$}q#t$}q#u$}q#v$}q#w$}q#y$}q#{$}q#|$}q$P$}q(b$}q(s$}q!]$}q!^$}q~P'&xO!Q*PO'z*QO({%POP'kaR'ka['kaj'kan'kar'ka!S'ka!l'ka!p'ka#R'ka#o'ka#p'ka#q'ka#r'ka#s'ka#t'ka#u'ka#v'ka#w'ka#y'ka#{'ka#|'ka$P'ka(b'ka(s'ka(z'ka!]'ka!^'ka~O!Q*PO'z*QOP'maR'ma['maj'man'mar'ma!S'ma!l'ma!p'ma#R'ma#o'ma#p'ma#q'ma#r'ma#s'ma#t'ma#u'ma#v'ma#w'ma#y'ma#{'ma#|'ma$P'ma(b'ma(s'ma(z'ma({'ma!]'ma!^'ma~OP%PqR%Pq[%Pqj%Pqr%Pq!S%Pq!l%Pq!p%Pq#R%Pq#o%Pq#p%Pq#q%Pq#r%Pq#s%Pq#t%Pq#u%Pq#v%Pq#w%Pq#y%Pq#{%Pq#|%Pq$P%Pq(b%Pq(s%Pq!]%Pq!^%Pq~P'&xOg%f!Z!]%f!Z#`%f!Z$P%f!Z~P!1WO!Y;hO~P#/eOr;iO!g#vO(s'qO~O[;kO!Y;hO~P#/eO!]'qq!^'qq~P#BiO!]#h!Z!^#h!Z~P#BiO#l%f!ZP%f!ZR%f!Z[%f!Za%f!Zj%f!Zr%f!Z!S%f!Z!]%f!Z!l%f!Z!p%f!Z#R%f!Z#o%f!Z#p%f!Z#q%f!Z#r%f!Z#s%f!Z#t%f!Z#u%f!Z#v%f!Z#w%f!Z#y%f!Z#{%f!Z#|%f!Z'{%f!Z(b%f!Z(s%f!Z!k%f!Z!Y%f!Z'x%f!Z#`%f!Zv%f!Z!_%f!Z%j%f!Z!g%f!Z~P#/eOr;tO!g#vO(s'qO~O!Y;uO~P#/eOr;|O!g#vO(s'qO~O!Y;}O~P#/eOP%f!ZR%f!Z[%f!Zj%f!Zr%f!Z!S%f!Z!l%f!Z!p%f!Z#R%f!Z#o%f!Z#p%f!Z#q%f!Z#r%f!Z#s%f!Z#t%f!Z#u%f!Z#v%f!Z#w%f!Z#y%f!Z#{%f!Z#|%f!Z$P%f!Z(b%f!Z(s%f!Z!]%f!Z!^%f!Z~P'&xOr<QO!g#vO(s'qO~Ov(gX~P1qO!Q%rO~P!)[O(V!lO~P!)[O!YfX!]fX#`fX~P%1{OP]XR]X[]Xj]Xr]X!Q]X!S]X!]]X!]fX!l]X!p]X#R]X#S]X#`]X#`fX#lfX#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#w]X#y]X#{]X#|]X$R]X(b]X(s]X(z]X({]X~O!gfX!k]X!kfX(sfX~P'KvOP<UOQ<UOSfOd>QOe!iOpkOr<UOskOtkOzkO|<UO!O<UO!SWO!WkO!XkO!_XO!i<XO!lZO!o<UO!p<UO!q<UO!s<YO!u<]O!x!hO$X!kO$o>OO(U)^O(WTO(ZUO(bVO(p[O~O!]<iO!^$ra~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<tO!S${O!_$|O!i>VO!l$xO#k<zO$X%`O$u<vO$w<xO$z%aO(U(wO(WTO(ZUO(b$uO(z$}O({%PO~Ol)eO~P(!lOr!eX(s!eX~P#!nO!^]X!^fX~P'KvO!YfX!Y${X!]fX!]${X#`fX~P!0SO#l<^O~O!g#vO#l<^O~O#`<nO~Oj<bO~O#`<}O!](xX!^(xX~O#`<nO!](vX!^(vX~O#l=OO~Og=QO~P!1WO#l=WO~O#l=XO~Og=QO(U&ZO~O!g#vO#l=YO~O!g#vO#l=OO~O$P=ZO~P#BiO#l=[O~O#l=]O~O#l=bO~O#l=cO~O#l=dO~O#l=eO~O$P=fO~P!1WO$P=gO~P!1WOl=rO~P7eOk#S#T#U#W#X#[#j#k#v$o$u$w$z%^%_%i%j%k%r%t%w%x%z%|~(PT#p!X'}(V#qs#o#rr!Q(O$^(O(U$`(f~",
  goto: "$8v)^PPPPPP)_PP)bP)sP+X/]PPPP6jPP7QPP<|PPP@pPAYPAYPPPAYPCbPAYPAYPAYPCfPCkPDYPIQPPPIUPPPPIULWPPPL^MOPIUPIUPP! ^IUPPPIUPIUP!#dIUP!&y!(O!(XP!({!)P!({!,]PPPPPPP!,|!(OPP!-^!/OP!2_IUIU!2d!5o!:[!:[!>Y!>bPPP!>hIUPPPPPPPPP!AvP!CSPPIU!DdPIUPIUIUIUIUIUPIU!EuP!IOP!LTP!LX!Lc!Lg!LgP!H{P!Lk!LkP# pP# tIUPIU# z#%OCfAYPAYPAYAYP#&]AYAY#(oAY#+gAY#-sAYAY#.c#0w#0w#0|#1V#0w#1bPP#0wPAY#1zAY#5yAYAY6jPPP#:OPPP#:i#:iP#:iP#;P#:iPP#;VP#:|P#:|#;j#:|#<U#<[#<_)bP#<b)bP#<k#<k#<kP)bP)bP)bP)bPP)bP#<q#<tP#<t)bP#<xP#<{P)bP)bP)bP)bP)bP)b)bPP#=R#=X#=d#=j#=p#=v#=|#>[#>b#>l#>r#>|#?S#?d#?j#@[#@n#@t#@z#AY#Ao#Cd#Cr#Cy#Ee#Es#Ge#Gs#Gy#HP#HV#Ha#Hg#Hm#Hw#IZ#IaPPPPPPPPPPP#IgPPPPPPP#J[#Mi$ R$ Y$ bPPP$&|P$'V$*O$0f$0i$0l$1k$1n$1u$1}P$2T$2WP$2t$2x$3p$5O$5T$5kPP$5p$5v$5z$5}$6R$6V$7R$7j$8R$8V$8Y$8]$8g$8j$8n$8rR!|RoqOXst!Z#d%m&r&t&u&w,u,z2]2`Y!vQ'a-f1p5{Q%tvQ%|yQ&T|Q&j!VS'W!e-^Q'g!iS'm!r!yU*l$|*[*pQ+q%}S,O&V&WQ,f&dQ-d'`Q-n'hQ-v'nQ0]*rQ1c,QQ1z,gR<{<Y%SdOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&r&t&u&w&{'T'c's(U(W(^(e(y({)P*O*j+Y+_,r,u,z-j-r.Q.W.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3l4z6T6e6f6i6|8t9T9_S#q]<V!p)`$Z$n'X)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RU+Q%]<s<tQ+v&PQ,h&gQ,o&oQ0y+iQ1O+kQ1Z+wQ2S,mQ3`.hQ5`0}Q5f1UQ6[1{Q7Y3dQ8`5gR9e7['OkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>R!S!nQ!r!v!y!z$|'W'`'a'm'n'o*l*p*r*s-^-d-f-v0]0`1p5{5}%[$ti#v$b$c$d$x${%O%Q%^%_%c)z*S*U*W*Z*b*h*x*y+h+k,U,X.g/Q/e/n/y/z/|0a0c0j0k0p1g1j1r3c4^4_4j4o5Q5[5_6S7W7v8Q8V8[8q9b9p9y:P:`:r;Q;[;d;k<l<m<o<p<q<r<u<v<w<x<y<z=R=S=T=U=W=X=[=]=^=_=`=a=b=c=f=g>O>W>X>[>]Q&X|S'U!e*[S']%i-aQ+v&PQ,R&WQ,h&gQ0o+TQ1Z+wQ1`+}Q2R,lQ2S,mQ5f1UQ5o1bQ6[1{Q6_1}Q6`2QQ8`5gQ8c5lQ8|6bQ:X8dQ:f8yR;V:YrnOXst!V!Z#d%m&i&r&t&u&w,u,z2]2`R,j&k&x^OPXYstuvwz!Z!`!g!j!o#S#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%m%t&R&k&n&o&r&t&u&w&{'T'c's(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>Q>R[#]WZ#W#Z'X(U!b%jm#h#i#l$x%e%h(_(i(j(k*Z*_*c+[+^+`,q-W.U.[.].^.`/n/q2e3[3]4a6r7TQ%wxQ%{yW&Q|&V&W,QQ&_!TQ'd!hQ'f!iQ(r#sS+p%|%}Q+t&PQ,a&bQ,e&dS-m'g'hQ.j(sQ1S+qQ1Y+wQ1[+xQ1_+|Q1u,bS1y,f,gQ2|-nQ5e1UQ5i1XQ5n1aQ6Z1zQ8_5gQ8b5kQ8f5pQ:T8^R;T:U!U$zi$d%O%Q%^%_%c*S*U*b*x*y/Q/y0a0c0j0k0p4_5Q8V9p>O>W>X!^%yy!i!u%{%|%}'V'f'g'h'l'v*k+p+q-Z-m-n-u0S0V1S2u2|3T4r4s4v7}9{Q+j%wQ,V&[Q,Y&]Q,d&dQ.i(rQ1t,aU1x,e,f,gQ3e.jQ6U1uS6Y1y1zQ8x6Z#f>S#v$b$c$x${)z*W*Z*h+h+k,U,X.g/e/n/z/|1g1j1r3c4^4j4o5[5_6S7W7v8Q8[8q9b9y:P:`:r;Q;[;d;k<o<q<u<w<y=R=T=W=[=^=`=b=f>[>]o>T<l<m<p<r<v<x<z=S=U=X=]=_=a=c=gW%Ti%V*z>OS&[!Q&iQ&]!RQ&^!SU+O%[%d=rR,T&Y%]%Si#v$b$c$d$x${%O%Q%^%_%c)z*S*U*W*Z*b*h*x*y+h+k,U,X.g/Q/e/n/y/z/|0a0c0j0k0p1g1j1r3c4^4_4j4o5Q5[5_6S7W7v8Q8V8[8q9b9p9y:P:`:r;Q;[;d;k<l<m<o<p<q<r<u<v<w<x<y<z=R=S=T=U=W=X=[=]=^=_=`=a=b=c=f=g>O>W>X>[>]T){$u)|V+Q%]<s<tW']!e%i*[-aS)O#y#zQ+e%rQ+{&SS.c(n(oQ1k,ZQ5T0lR8i5u'OkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>R$g$^c#Y#e%q%s%u(T(Z(u(z)S)T)U)V)W)X)Y)Z)[)])_)a)c)h)r+f+z-[-y.O.T.V.t.w.{.}/O/P/c0q2n3O3V3k3p3q3r3s3t3u3v3w3x3y3z3{3|4P4Q4X5X5c6u6{7Q7a7b7k7l8k9X9]9g9m9n:o;W;`<W=uT#TV#U'PkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RQ'Y!eR2q-^!W!nQ!e!r!v!y!z$|'W'`'a'm'n'o*[*l*p*r*s-^-d-f-v0]0`1p5{5}R1m,]nqOXst!Z#d%m&r&t&u&w,u,z2]2`Q&y!^Q'w!xS(t#u<^Q+n%zQ,_&_Q,`&aQ-k'eQ-x'pS.s(y=OS0r+Y=YQ1Q+oQ1o,^Q2d,|Q2f,}Q2m-XQ2z-lQ2}-pS5Y0s=dQ5a1RS5d1T=eQ6t2oQ6x2{Q6}3SQ8]5bQ9Y6vQ9Z6yQ9^7OR:l9V$b$]c#Y#e%s%u(T(Z(u(z)S)T)U)V)W)X)Y)Z)[)])_)a)c)h)r+f+z-[-y.O.T.V.t.w.{/O/P/c0q2n3O3V3k3p3q3r3s3t3u3v3w3x3y3z3{3|4P4Q4X5X5c6u6{7Q7a7b7k7l8k9X9]9g9m9n:o;W;`<W=uS(p#p'jQ)Q#zS+d%q.}S.d(o(qR3^.e'OkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RS#q]<VQ&t!XQ&u!YQ&w![Q&x!]R2[,xQ'b!hQ+g%wQ-i'dS.f(r+jQ2x-hW3b.i.j0x0zQ6w2yW7U3_3a3e5^U9a7V7X7ZU:q9c9d9fS;b:p:sQ;p;cR;x;qU!wQ'a-fT5y1p5{!Q_OXZ`st!V!Z#d#h%e%m&i&k&r&t&u&w(k,u,z.]2]2`]!pQ!r'a-f1p5{T#q]<V%^{OPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&o&r&t&u&w&{'T'c's(U(W(^(e(y({)P*O*j+Y+_+i,r,u,z-j-r.Q.W.h.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3d3l4z6T6e6f6i6|7[8t9T9_S)O#y#zS.c(n(o!q=k$Z$n'X)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RU$fd)`,oS(q#p'jU*w%R(x4OU0n+P.o7gQ5^0yQ7V3`Q9d7YR:s9em!tQ!r!v!y!z'a'm'n'o-f-v1p5{5}Q'u!uS(g#g2VS-t'l'xQ/t*^Q0S*kQ3U-wQ4f/uQ4r0UQ4s0VQ4x0_Q7r4`S7}4t4vS8R4y4{Q9r7sQ9v7yQ9{8OQ:Q8TS:{9w9xS;g:|;PS;s;h;iS;{;t;uS<P;|;}R<S<QQ#wbQ't!uS(f#g2VS(h#m+XQ+Z%fQ+l%xQ+r&OU-s'l'u'xQ.X(gU/s*^*a/xQ0T*kQ0W*mQ1P+mQ1v,cS3R-t-wQ3Z.aS4e/t/uQ4n0QS4q0S0_Q4u0XQ6W1wQ7P3US7q4`4bQ7u4fU7|4r4x4{Q8P4wQ8v6XS9q7r7sQ9u7yQ9}8RQ:O8SQ:c8wQ:y9rS:z9v9xQ;S:QQ;^:dS;f:{;PS;r;g;hS;z;s;uS<O;{;}Q<R<PQ<T<SQ=n=iQ=z=sR={=tV!wQ'a-f%^aOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&o&r&t&u&w&{'T'c's(U(W(^(e(y({)P*O*j+Y+_+i,r,u,z-j-r.Q.W.h.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3d3l4z6T6e6f6i6|7[8t9T9_S#wz!j!p=h$Z$n'X)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RR=n>Q%^bOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&o&r&t&u&w&{'T'c's(U(W(^(e(y({)P*O*j+Y+_+i,r,u,z-j-r.Q.W.h.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3d3l4z6T6e6f6i6|7[8t9T9_Q%fj!^%xy!i!u%{%|%}'V'f'g'h'l'v*k+p+q-Z-m-n-u0S0V1S2u2|3T4r4s4v7}9{S&Oz!jQ+m%yQ,c&dW1w,d,e,f,gU6X1x1y1zS8w6Y6ZQ:d8x!p=i$Z$n'X)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RQ=s>PR=t>Q%QeOPXYstuvw!Z!`!g!o#S#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&r&t&u&w&{'T'c's(W(^(e(y({)P*O*j+Y+_+i,r,u,z-j-r.Q.W.h.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3d3l4z6T6e6f6i6|7[8t9T9_Y#bWZ#W#Z(U!b%jm#h#i#l$x%e%h(_(i(j(k*Z*_*c+[+^+`,q-W.U.[.].^.`/n/q2e3[3]4a6r7TQ,p&o!n=j$Z$n)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RR=m'XU'^!e%i*[R2s-aX'[!e%i*[-a%SdOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&r&t&u&w&{'T'c's(U(W(^(e(y({)P*O*j+Y+_,r,u,z-j-r.Q.W.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3l4z6T6e6f6i6|8t9T9_!p)`$Z$n'X)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RQ,o&oQ0y+iQ3`.hQ7Y3dR9e7[!b$Tc#Y%q(T(Z(u(z)[)])a)h+z-y.O.T.V.t.w/c0q3O3V3k3{5X5c6{7Q7a9]:o<W}<d)_)r-[.}2n3p3y3z4P4X6u7b7k7l8k9X9g9m9n;W;`=u!f$Vc#Y%q(T(Z(u(z)X)Y)[)])a)h+z-y.O.T.V.t.w/c0q3O3V3k3{5X5c6{7Q7a9]:o<W!R<f)_)r-[.}2n3p3v3w3y3z4P4X6u7b7k7l8k9X9g9m9n;W;`=u!^$Zc#Y%q(T(Z(u(z)a)h+z-y.O.T.V.t.w/c0q3O3V3k3{5X5c6{7Q7a9]:o<WQ4_/lx>R)_)r-[.}2n3p4P4X6u7b7k7l8k9X9g9m9n;W;`=uQ>W>YR>X>Z'OkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RS$oh$pR4U/V'VgOPWXYZhstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n$p%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/V/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RT$kf$qQ$ifS)k$l)oR)w$qT$jf$qT)m$l)o'VhOPWXYZhstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n$p%m%t&R&k&n&o&r&t&u&w&{'T'X'c's(U(W(^(e(y({)P)t*O*j+Y+_+i,r,u,z-Y-j-r.Q.W.h.u.|/V/W/o0^0m0s1T1s2T2U2W2Y2]2`2b2p3Q3W3d3l4T4z5w6T6e6f6i6s6|7[8t9T9_:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>RT$oh$pQ$rhR)v$p%^jOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%m%t&R&k&n&o&r&t&u&w&{'T'c's(U(W(^(e(y({)P*O*j+Y+_+i,r,u,z-j-r.Q.W.h.u.|/o0^0m0s1T1s2T2U2W2Y2]2`2b3Q3W3d3l4z6T6e6f6i6|7[8t9T9_!q>P$Z$n'X)t-Y/W2p4T5w6s:Z:m<U<X<Y<]<^<_<`<a<b<c<d<e<f<g<h<i<k<n<{<}=O=Q=Y=Z=d=e>R#glOPXZst!Z!`!o#S#d#o#{$n%m&k&n&o&r&t&u&w&{'T'c)P)t*j+_+i,r,u,z-j.h/W/o0^0m1s2T2U2W2Y2]2`2b3d4T4z6T6e6f6i7[8t9T!U%Ri$d%O%Q%^%_%c*S*U*b*x*y/Q/y0a0c0j0k0p4_5Q8V9p>O>W>X#f(x#v$b$c$x${)z*W*Z*h+h+k,U,X.g/e/n/z/|1g1j1r3c4^4j4o5[5_6S7W7v8Q8[8q9b9y:P:`:r;Q;[;d;k<o<q<u<w<y=R=T=W=[=^=`=b=f>[>]Q+U%aQ/d*Po4O<l<m<p<r<v<x<z=S=U=X=]=_=a=c=g!U$yi$d%O%Q%^%_%c*S*U*b*x*y/Q/y0a0c0j0k0p4_5Q8V9p>O>W>XQ*d$zU*m$|*[*pQ+V%bQ0X*n#f=p#v$b$c$x${)z*W*Z*h+h+k,U,X.g/e/n/z/|1g1j1r3c4^4j4o5[5_6S7W7v8Q8[8q9b9y:P:`:r;Q;[;d;k<o<q<u<w<y=R=T=W=[=^=`=b=f>[>]n=q<l<m<p<r<v<x<z=S=U=X=]=_=a=c=gQ=v>SQ=w>TQ=x>UR=y>V!U%Ri$d%O%Q%^%_%c*S*U*b*x*y/Q/y0a0c0j0k0p4_5Q8V9p>O>W>X#f(x#v$b$c$x${)z*W*Z*h+h+k,U,X.g/e/n/z/|1g1j1r3c4^4j4o5[5_6S7W7v8Q8[8q9b9y:P:`:r;Q;[;d;k<o<q<u<w<y=R=T=W=[=^=`=b=f>[>]o4O<l<m<p<r<v<x<z=S=U=X=]=_=a=c=gnoOXst!Z#d%m&r&t&u&w,u,z2]2`S*g${*ZQ-T'OQ-U'QR4i/z%[%Si#v$b$c$d$x${%O%Q%^%_%c)z*S*U*W*Z*b*h*x*y+h+k,U,X.g/Q/e/n/y/z/|0a0c0j0k0p1g1j1r3c4^4_4j4o5Q5[5_6S7W7v8Q8V8[8q9b9p9y:P:`:r;Q;[;d;k<l<m<o<p<q<r<u<v<w<x<y<z=R=S=T=U=W=X=[=]=^=_=`=a=b=c=f=g>O>W>X>[>]Q,W&]Q1i,YQ5s1hR8h5tV*o$|*[*pU*o$|*[*pT5z1p5{S0Q*j/oQ4w0^T8S4z:]Q+l%xQ0W*mQ1P+mQ1v,cQ6W1wQ8v6XQ:c8wR;^:d!U%Oi$d%O%Q%^%_%c*S*U*b*x*y/Q/y0a0c0j0k0p4_5Q8V9p>O>W>Xx*S$v)f*T*v+W/w0e0f4R4g5R5S5W7p8U:R:x=o=|=}S0a*u0b#f<o#v$b$c$x${)z*W*Z*h+h+k,U,X.g/e/n/z/|1g1j1r3c4^4j4o5[5_6S7W7v8Q8[8q9b9y:P:`:r;Q;[;d;k<o<q<u<w<y=R=T=W=[=^=`=b=f>[>]n<p<l<m<p<r<v<x<z=S=U=X=]=_=a=c=g!d=R(v)d*]*f.k.n.r/`/l/}0w1f3h4[4h4l5r7]7`7w7z8X8Z9t9|:S:};R;e;j;v>Y>Z`=S3}7c7f7j9h:t:w;yS=^.m3iT=_7e9k!U%Qi$d%O%Q%^%_%c*S*U*b*x*y/Q/y0a0c0j0k0p4_5Q8V9p>O>W>X|*U$v)f*V*u+W/h/w0e0f4R4g4|5R5S5W7p8U:R:x=o=|=}S0c*v0d#f<q#v$b$c$x${)z*W*Z*h+h+k,U,X.g/e/n/z/|1g1j1r3c4^4j4o5[5_6S7W7v8Q8[8q9b9y:P:`:r;Q;[;d;k<o<q<u<w<y=R=T=W=[=^=`=b=f>[>]n<r<l<m<p<r<v<x<z=S=U=X=]=_=a=c=g!h=T(v)d*]*f.l.m.r/`/l/}0w1f3f3h4[4h4l5r7]7^7`7w7z8X8Z9t9|:S:};R;e;j;v>Y>Zd=U3}7d7e7j9h9i:t:u:w;yS=`.n3jT=a7f9lrnOXst!V!Z#d%m&i&r&t&u&w,u,z2]2`Q&f!UR,r&ornOXst!V!Z#d%m&i&r&t&u&w,u,z2]2`R&f!UQ,[&^R1e,TsnOXst!V!Z#d%m&i&r&t&u&w,u,z2]2`Q1q,aS6R1t1uU8p6P6Q6US:_8r8sS;Y:^:aQ;m;ZR;w;nQ&m!VR,k&iR6_1}R:f8yW&Q|&V&W,QR1[+xQ&r!WR,u&sR,{&xT2^,z2`R-P&yQ-O&yR2g-PQ'z!{R-z'zSsOtQ#dXT%ps#dQ#OTR'|#OQ#RUR(O#RQ)|$uR/a)|Q#UVR(R#UQ#XWU(X#X(Y.RQ(Y#YR.R(ZQ-_'YR2r-_Q.v(zS3m.v3nR3n.wQ-f'aR2v-fY!rQ'a-f1p5{R'k!rQ/R)fR4S/RU#_W%h*ZU(`#_(a.SQ(a#`R.S([Q-b'^R2t-bt`OXst!V!Z#d%m&i&k&r&t&u&w,u,z2]2`S#hZ%eU#r`#h.]R.](kQ(l#jQ.Y(hW.b(l.Y3X7RQ3X.ZR7R3YQ)o$lR/X)oQ$phR)u$pQ$`cU)b$`-}<jQ-}<WR<j)rQ/r*^W4c/r4d7t9sU4d/s/t/uS7t4e4fR9s7u$e*R$v(v)d)f*]*f*u*v+R+S+W.m.n.p.q.r/`/h/j/l/w/}0e0f0w1f3f3g3h3}4R4[4g4h4l4|5O5R5S5W5r7]7^7_7`7e7f7h7i7j7p7w7z8U8X8Z9h9i9j9t9|:R:S:t:u:v:w:x:};R;e;j;v;y=o=|=}>Y>ZQ/{*fU4k/{4m7xQ4m/}R7x4lS*p$|*[R0Z*px*T$v)f*u*v+W/w0e0f4R4g5R5S5W7p8U:R:x=o=|=}!d.k(v)d*]*f.m.n.r/`/l/}0w1f3h4[4h4l5r7]7`7w7z8X8Z9t9|:S:};R;e;j;v>Y>ZU/i*T.k7ca7c3}7e7f7j9h:t:w;yQ0b*uQ3i.mU4}0b3i9kR9k7e|*V$v)f*u*v+W/h/w0e0f4R4g4|5R5S5W7p8U:R:x=o=|=}!h.l(v)d*]*f.m.n.r/`/l/}0w1f3f3h4[4h4l5r7]7^7`7w7z8X8Z9t9|:S:};R;e;j;v>Y>ZU/k*V.l7de7d3}7e7f7j9h9i:t:u:w;yQ0d*vQ3j.nU5P0d3j9lR9l7fQ*{%UR0h*{Q5]0wR8Y5]Q+a%kR0v+aQ5v1kS8j5v:[R:[8kQ,^&_R1n,^Q5{1pR8m5{Q1|,hS6]1|8zR8z6_Q1V+tW5h1V5j8a:VQ5j1YQ8a5iR:V8bQ+y&QR1]+yQ2`,zR6m2`YrOXst#dQ&v!ZQ+c%mQ,t&rQ,v&tQ,w&uQ,y&wQ2Z,uS2^,z2`R6l2]Q%opQ&z!_Q&}!aQ'P!bQ'R!cQ'r!uQ+b%lQ+n%zQ,S&XQ,j&mQ-R&|W-q'l't'u'xQ-x'pQ0Y*oQ1Q+oQ1d,RS2P,k,nQ2h-QQ2i-TQ2j-UQ2}-pW3P-s-t-w-yQ5a1RQ5m1`Q5q1fQ6V1vQ6a2RQ6k2[U6z3O3R3UQ6}3SQ8]5bQ8e5oQ8g5rQ8l5zQ8u6WQ8{6`S9[6{7PQ9^7OQ:W8cQ:b8vQ:g8|Q:n9]Q;U:XQ;]:cQ;a:oQ;l;VR;o;^Q%zyQ'e!iQ'p!uU+o%{%|%}Q-X'VU-l'f'g'hS-p'l'vQ0R*kS1R+p+qQ2o-ZS2{-m-nQ3S-uS4p0S0VQ5b1SQ6v2uQ6y2|Q7O3TU7{4r4s4vQ9z7}R;O9{S$wi>OR*|%VU%Ui%V>OR0g*zQ$viS(v#v+kS)d$b$cQ)f$dQ*]$xS*f${*ZQ*u%OQ*v%QQ+R%^Q+S%_Q+W%cQ.m<oQ.n<qQ.p<uQ.q<wQ.r<yQ/`)zQ/h*SQ/j*UQ/l*WQ/w*bS/}*h/nQ0e*xQ0f*yl0w+h,X.g1j1r3c6S7W8q9b:`:r;[;dQ1f,UQ3f=RQ3g=TQ3h=WS3}<l<mQ4R/QS4[/e4^Q4g/yQ4h/zQ4l/|Q4|0aQ5O0cQ5R0jQ5S0kQ5W0pQ5r1gQ7]=[Q7^=^Q7_=`Q7`=bQ7e<pQ7f<rQ7h<vQ7i<xQ7j<zQ7p4_Q7w4jQ7z4oQ8U5QQ8X5[Q8Z5_Q9h=XQ9i=SQ9j=UQ9t7vQ9|8QQ:R8VQ:S8[Q:t=]Q:u=_Q:v=aQ:w=cQ:x9pQ:}9yQ;R:PQ;e=fQ;j;QQ;v;kQ;y=gQ=o>OQ=|>WQ=}>XQ>Y>[R>Z>]Q+P%]Q.o<sR7g<tnpOXst!Z#d%m&r&t&u&w,u,z2]2`Q!fPS#fZ#oQ&|!`W'i!o*j0^4zQ(Q#SQ)R#{Q)s$nS,n&k&nQ,s&oQ-Q&{S-V'T/oQ-h'cQ.y)PQ/])tQ0t+_Q0z+iQ2X,rQ2y-jQ3a.hQ4W/WQ5U0mQ6Q1sQ6c2TQ6d2UQ6h2WQ6j2YQ6o2bQ7Z3dQ7m4TQ8s6TQ9P6eQ9Q6fQ9S6iQ9f7[Q:a8tR:k9T#[cOPXZst!Z!`!o#d#o#{%m&k&n&o&r&t&u&w&{'T'c)P*j+_+i,r,u,z-j.h/o0^0m1s2T2U2W2Y2]2`2b3d4z6T6e6f6i7[8t9TQ#YWQ#eYQ%quQ%svS%uw!gS(T#W(WQ(Z#ZQ(u#uQ(z#xQ)S$OQ)T$PQ)U$QQ)V$RQ)W$SQ)X$TQ)Y$UQ)Z$VQ)[$WQ)]$XQ)_$ZQ)a$_Q)c$aQ)h$eW)r$n)t/W4TQ+f%tQ+z&RS-['X2pQ-y'sS.O(U.QQ.T(^Q.V(eQ.t(yQ.w({Q.{<UQ.}<XQ/O<YQ/P<]Q/c*OQ0q+YQ2n-YQ3O-rQ3V.WQ3k.uQ3p<^Q3q<_Q3r<`Q3s<aQ3t<bQ3u<cQ3v<dQ3w<eQ3x<fQ3y<gQ3z<hQ3{.|Q3|<kQ4P<nQ4Q<{Q4X<iQ5X0sQ5c1TQ6u<}Q6{3QQ7Q3WQ7a3lQ7b=OQ7k=QQ7l=YQ8k5wQ9X6sQ9]6|Q9g=ZQ9m=dQ9n=eQ:o9_Q;W:ZQ;`:mQ<W#SR=u>RR#[WR'Z!el!tQ!r!v!y!z'a'm'n'o-f-v1p5{5}S'V!e-^U*k$|*[*pS-Z'W'`S0V*l*rQ0_*sQ2u-dQ4v0]R4{0`R(|#xQ!fQT-e'a-f]!qQ!r'a-f1p5{Q#p]R'j<VR)g$dY!uQ'a-f1p5{Q'l!rS'v!v!yS'x!z5}S-u'm'nQ-w'oR3T-vT#kZ%eS#jZ%eS%km,qU(h#h#i#lS.Z(i(jQ._(kQ0u+`Q3Y.[U3Z.].^.`S7S3[3]R9`7Td#^W#W#Z%h(U(_*Z+[.U/nr#gZm#h#i#l%e(i(j(k+`.[.].^.`3[3]7TS*^$x*cQ/u*_Q2V,qQ2l-WQ4`/qQ6q2eQ7s4aQ9W6rT=l'X+^V#aW%h*ZU#`W%h*ZS(V#W(_U([#Z+[/nS-]'X+^T.P(U.UV'_!e%i*[Q$lfR)y$qT)n$l)oR4V/VT*`$x*cT*i${*ZQ0x+hQ1h,XQ3_.gQ5t1jQ6P1rQ7X3cQ8r6SQ9c7WQ:^8qQ:p9bQ;Z:`Q;c:rQ;n;[R;q;dnqOXst!Z#d%m&r&t&u&w,u,z2]2`Q&l!VR,j&itmOXst!U!V!Z#d%m&i&r&t&u&w,u,z2]2`R,q&oT%lm,qR1l,ZR,i&gQ&U|S,P&V&WR1_,QR+u&PT&p!W&sT&q!W&sT2_,z2`",
  nodeNames: "⚠ ArithOp ArithOp ?. JSXStartTag LineComment BlockComment Script Hashbang ExportDeclaration export Star as VariableName String Escape from ; default FunctionDeclaration async function VariableDefinition > < TypeParamList in out const TypeDefinition extends ThisType this LiteralType ArithOp Number BooleanLiteral TemplateType InterpolationEnd Interpolation InterpolationStart NullType null VoidType void TypeofType typeof MemberExpression . PropertyName [ TemplateString Escape Interpolation super RegExp ] ArrayExpression Spread , } { ObjectExpression Property async get set PropertyDefinition Block : NewTarget new NewExpression ) ( ArgList UnaryExpression delete LogicOp BitOp YieldExpression yield AwaitExpression await ParenthesizedExpression ClassExpression class ClassBody MethodDeclaration Decorator @ MemberExpression PrivatePropertyName CallExpression TypeArgList CompareOp < declare Privacy static abstract override PrivatePropertyDefinition PropertyDeclaration readonly accessor Optional TypeAnnotation Equals StaticBlock FunctionExpression ArrowFunction ParamList ParamList ArrayPattern ObjectPattern PatternProperty VariableDefinition Privacy readonly Arrow MemberExpression BinaryExpression ArithOp ArithOp ArithOp ArithOp BitOp CompareOp instanceof satisfies CompareOp BitOp BitOp BitOp LogicOp LogicOp ConditionalExpression LogicOp LogicOp AssignmentExpression UpdateOp PostfixExpression CallExpression InstantiationExpression TaggedTemplateExpression DynamicImport import ImportMeta JSXElement JSXSelfCloseEndTag JSXSelfClosingTag JSXIdentifier JSXBuiltin JSXIdentifier JSXNamespacedName JSXMemberExpression JSXSpreadAttribute JSXAttribute JSXAttributeValue JSXEscape JSXEndTag JSXOpenTag JSXFragmentTag JSXText JSXEscape JSXStartCloseTag JSXCloseTag PrefixCast < ArrowFunction TypeParamList SequenceExpression InstantiationExpression KeyofType keyof UniqueType unique ImportType InferredType infer TypeName ParenthesizedType FunctionSignature ParamList NewSignature IndexedType TupleType Label ArrayType ReadonlyType ObjectType MethodType PropertyType IndexSignature PropertyDefinition CallSignature TypePredicate asserts is NewSignature new UnionType LogicOp IntersectionType LogicOp ConditionalType ParameterizedType ClassDeclaration abstract implements type VariableDeclaration let var using TypeAliasDeclaration InterfaceDeclaration interface EnumDeclaration enum EnumBody NamespaceDeclaration namespace module AmbientDeclaration declare GlobalDeclaration global ClassDeclaration ClassBody AmbientFunctionDeclaration ExportGroup VariableName VariableName ImportDeclaration defer ImportGroup ForStatement for ForSpec ForInSpec ForOfSpec of WhileStatement while WithStatement with DoStatement do IfStatement if else SwitchStatement switch SwitchBody CaseLabel case DefaultLabel TryStatement try CatchClause catch FinallyClause finally ReturnStatement return ThrowStatement throw BreakStatement break ContinueStatement continue DebuggerStatement debugger LabeledStatement ExpressionStatement SingleExpression SingleClassItem",
  maxTerm: 381,
  context: db,
  nodeProps: [
    ["isolate", -8, 5, 6, 14, 37, 39, 51, 53, 55, ""],
    ["group", -26, 9, 17, 19, 68, 208, 212, 216, 217, 219, 222, 225, 235, 238, 244, 246, 248, 250, 253, 259, 265, 267, 269, 271, 273, 275, 276, "Statement", -34, 13, 14, 32, 35, 36, 42, 51, 54, 55, 57, 62, 70, 72, 76, 80, 82, 84, 85, 110, 111, 121, 122, 137, 140, 142, 143, 144, 145, 146, 148, 149, 168, 170, 172, "Expression", -23, 31, 33, 37, 41, 43, 45, 174, 176, 178, 179, 181, 182, 183, 185, 186, 187, 189, 190, 191, 202, 204, 206, 207, "Type", -3, 88, 103, 109, "ClassItem"],
    ["openedBy", 23, "<", 38, "InterpolationStart", 56, "[", 60, "{", 73, "(", 161, "JSXStartCloseTag"],
    ["closedBy", -2, 24, 169, ">", 40, "InterpolationEnd", 50, "]", 61, "}", 74, ")", 166, "JSXEndTag"]
  ],
  propSources: [bb],
  skippedNodes: [0, 5, 6, 279],
  repeatNodeCount: 37,
  tokenData: "$Fq07[R!bOX%ZXY+gYZ-yZ[+g[]%Z]^.c^p%Zpq+gqr/mrs3cst:_tuEruvJSvwLkwx! Yxy!'iyz!(sz{!)}{|!,q|}!.O}!O!,q!O!P!/Y!P!Q!9j!Q!R#:O!R![#<_![!]#I_!]!^#Jk!^!_#Ku!_!`$![!`!a$$v!a!b$*T!b!c$,r!c!}Er!}#O$-|#O#P$/W#P#Q$4o#Q#R$5y#R#SEr#S#T$7W#T#o$8b#o#p$<r#p#q$=h#q#r$>x#r#s$@U#s$f%Z$f$g+g$g#BYEr#BY#BZ$A`#BZ$ISEr$IS$I_$A`$I_$I|Er$I|$I}$Dk$I}$JO$Dk$JO$JTEr$JT$JU$A`$JU$KVEr$KV$KW$A`$KW&FUEr&FU&FV$A`&FV;'SEr;'S;=`I|<%l?HTEr?HT?HU$A`?HUOEr(n%d_$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z&j&hT$j&jO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c&j&zP;=`<%l&c'|'U]$j&j([!bOY&}YZ&cZw&}wx&cx!^&}!^!_'}!_#O&}#O#P&c#P#o&}#o#p'}#p;'S&};'S;=`(l<%lO&}!b(SU([!bOY'}Zw'}x#O'}#P;'S'};'S;=`(f<%lO'}!b(iP;=`<%l'}'|(oP;=`<%l&}'[(y]$j&j(XpOY(rYZ&cZr(rrs&cs!^(r!^!_)r!_#O(r#O#P&c#P#o(r#o#p)r#p;'S(r;'S;=`*a<%lO(rp)wU(XpOY)rZr)rs#O)r#P;'S)r;'S;=`*Z<%lO)rp*^P;=`<%l)r'[*dP;=`<%l(r#S*nX(Xp([!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g#S+^P;=`<%l*g(n+dP;=`<%l%Z07[+rq$j&j(Xp([!b'}0/lOX%ZXY+gYZ&cZ[+g[p%Zpq+gqr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p$f%Z$f$g+g$g#BY%Z#BY#BZ+g#BZ$IS%Z$IS$I_+g$I_$JT%Z$JT$JU+g$JU$KV%Z$KV$KW+g$KW&FU%Z&FU&FV+g&FV;'S%Z;'S;=`+a<%l?HT%Z?HT?HU+g?HUO%Z07[.ST(Y#S$j&j(O0/lO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c07[.n_$j&j(Xp([!b(O0/lOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z)3p/x`$j&j!p),Q(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`0z!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW1V`#w(Ch$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`2X!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW2d_#w(Ch$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'At3l_(W':f$j&j([!bOY4kYZ5qZr4krs7nsw4kwx5qx!^4k!^!_8p!_#O4k#O#P5q#P#o4k#o#p8p#p;'S4k;'S;=`:X<%lO4k(^4r_$j&j([!bOY4kYZ5qZr4krs7nsw4kwx5qx!^4k!^!_8p!_#O4k#O#P5q#P#o4k#o#p8p#p;'S4k;'S;=`:X<%lO4k&z5vX$j&jOr5qrs6cs!^5q!^!_6y!_#o5q#o#p6y#p;'S5q;'S;=`7h<%lO5q&z6jT$e`$j&jO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c`6|TOr6yrs7]s;'S6y;'S;=`7b<%lO6y`7bO$e``7eP;=`<%l6y&z7kP;=`<%l5q(^7w]$e`$j&j([!bOY&}YZ&cZw&}wx&cx!^&}!^!_'}!_#O&}#O#P&c#P#o&}#o#p'}#p;'S&};'S;=`(l<%lO&}!r8uZ([!bOY8pYZ6yZr8prs9hsw8pwx6yx#O8p#O#P6y#P;'S8p;'S;=`:R<%lO8p!r9oU$e`([!bOY'}Zw'}x#O'}#P;'S'};'S;=`(f<%lO'}!r:UP;=`<%l8p(^:[P;=`<%l4k%9[:hh$j&j(Xp([!bOY%ZYZ&cZq%Zqr<Srs&}st%ZtuCruw%Zwx(rx!^%Z!^!_*g!_!c%Z!c!}Cr!}#O%Z#O#P&c#P#R%Z#R#SCr#S#T%Z#T#oCr#o#p*g#p$g%Z$g;'SCr;'S;=`El<%lOCr(r<__WS$j&j(Xp([!bOY<SYZ&cZr<Srs=^sw<Swx@nx!^<S!^!_Bm!_#O<S#O#P>`#P#o<S#o#pBm#p;'S<S;'S;=`Cl<%lO<S(Q=g]WS$j&j([!bOY=^YZ&cZw=^wx>`x!^=^!^!_?q!_#O=^#O#P>`#P#o=^#o#p?q#p;'S=^;'S;=`@h<%lO=^&n>gXWS$j&jOY>`YZ&cZ!^>`!^!_?S!_#o>`#o#p?S#p;'S>`;'S;=`?k<%lO>`S?XSWSOY?SZ;'S?S;'S;=`?e<%lO?SS?hP;=`<%l?S&n?nP;=`<%l>`!f?xWWS([!bOY?qZw?qwx?Sx#O?q#O#P?S#P;'S?q;'S;=`@b<%lO?q!f@eP;=`<%l?q(Q@kP;=`<%l=^'`@w]WS$j&j(XpOY@nYZ&cZr@nrs>`s!^@n!^!_Ap!_#O@n#O#P>`#P#o@n#o#pAp#p;'S@n;'S;=`Bg<%lO@ntAwWWS(XpOYApZrAprs?Ss#OAp#O#P?S#P;'SAp;'S;=`Ba<%lOAptBdP;=`<%lAp'`BjP;=`<%l@n#WBvYWS(Xp([!bOYBmZrBmrs?qswBmwxApx#OBm#O#P?S#P;'SBm;'S;=`Cf<%lOBm#WCiP;=`<%lBm(rCoP;=`<%l<S%9[C}i$j&j(p%1l(Xp([!bOY%ZYZ&cZr%Zrs&}st%ZtuCruw%Zwx(rx!Q%Z!Q![Cr![!^%Z!^!_*g!_!c%Z!c!}Cr!}#O%Z#O#P&c#P#R%Z#R#SCr#S#T%Z#T#oCr#o#p*g#p$g%Z$g;'SCr;'S;=`El<%lOCr%9[EoP;=`<%lCr07[FRk$j&j(Xp([!b$^#t(U,2j(f$I[OY%ZYZ&cZr%Zrs&}st%ZtuEruw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Er![!^%Z!^!_*g!_!c%Z!c!}Er!}#O%Z#O#P&c#P#R%Z#R#SEr#S#T%Z#T#oEr#o#p*g#p$g%Z$g;'SEr;'S;=`I|<%lOEr+dHRk$j&j(Xp([!b$^#tOY%ZYZ&cZr%Zrs&}st%ZtuGvuw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Gv![!^%Z!^!_*g!_!c%Z!c!}Gv!}#O%Z#O#P&c#P#R%Z#R#SGv#S#T%Z#T#oGv#o#p*g#p$g%Z$g;'SGv;'S;=`Iv<%lOGv+dIyP;=`<%lGv07[JPP;=`<%lEr(KWJ_`$j&j(Xp([!b#q(ChOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KWKl_$j&j$R(Ch(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z,#xLva({+JY$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sv%ZvwM{wx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KWNW`$j&j#{(Ch(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'At! c_(Z';W$j&j(XpOY!!bYZ!#hZr!!brs!#hsw!!bwx!$xx!^!!b!^!_!%z!_#O!!b#O#P!#h#P#o!!b#o#p!%z#p;'S!!b;'S;=`!'c<%lO!!b'l!!i_$j&j(XpOY!!bYZ!#hZr!!brs!#hsw!!bwx!$xx!^!!b!^!_!%z!_#O!!b#O#P!#h#P#o!!b#o#p!%z#p;'S!!b;'S;=`!'c<%lO!!b&z!#mX$j&jOw!#hwx6cx!^!#h!^!_!$Y!_#o!#h#o#p!$Y#p;'S!#h;'S;=`!$r<%lO!#h`!$]TOw!$Ywx7]x;'S!$Y;'S;=`!$l<%lO!$Y`!$oP;=`<%l!$Y&z!$uP;=`<%l!#h'l!%R]$e`$j&j(XpOY(rYZ&cZr(rrs&cs!^(r!^!_)r!_#O(r#O#P&c#P#o(r#o#p)r#p;'S(r;'S;=`*a<%lO(r!Q!&PZ(XpOY!%zYZ!$YZr!%zrs!$Ysw!%zwx!&rx#O!%z#O#P!$Y#P;'S!%z;'S;=`!']<%lO!%z!Q!&yU$e`(XpOY)rZr)rs#O)r#P;'S)r;'S;=`*Z<%lO)r!Q!'`P;=`<%l!%z'l!'fP;=`<%l!!b/5|!'t_!l/.^$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z#&U!)O_!k!Lf$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z-!n!*[b$j&j(Xp([!b(V%&f#r(ChOY%ZYZ&cZr%Zrs&}sw%Zwx(rxz%Zz{!+d{!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW!+o`$j&j(Xp([!b#o(ChOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z+;x!,|`$j&j(Xp([!br+4YOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z,$U!.Z_!]+Jf$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[!/ec$j&j(Xp([!b!Q.2^OY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!0p!P!Q%Z!Q![!3Y![!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z#%|!0ya$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!2O!P!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z#%|!2Z_![!L^$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!3eg$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![!3Y![!^%Z!^!_*g!_!g%Z!g!h!4|!h#O%Z#O#P&c#P#R%Z#R#S!3Y#S#X%Z#X#Y!4|#Y#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!5Vg$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx{%Z{|!6n|}%Z}!O!6n!O!Q%Z!Q![!8S![!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S!8S#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!6wc$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![!8S![!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S!8S#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!8_c$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![!8S![!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S!8S#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[!9uf$j&j(Xp([!b#p(ChOY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcxz!;Zz{#-}{!P!;Z!P!Q#/d!Q!^!;Z!^!_#(i!_!`#7S!`!a#8i!a!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z?O!;fb$j&j(Xp([!b!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z>^!<w`$j&j([!b!X7`OY!<nYZ&cZw!<nwx!=yx!P!<n!P!Q!Eq!Q!^!<n!^!_!Gr!_!}!<n!}#O!KS#O#P!Dy#P#o!<n#o#p!Gr#p;'S!<n;'S;=`!L]<%lO!<n<z!>Q^$j&j!X7`OY!=yYZ&cZ!P!=y!P!Q!>|!Q!^!=y!^!_!@c!_!}!=y!}#O!CW#O#P!Dy#P#o!=y#o#p!@c#p;'S!=y;'S;=`!Ek<%lO!=y<z!?Td$j&j!X7`O!^&c!_#W&c#W#X!>|#X#Z&c#Z#[!>|#[#]&c#]#^!>|#^#a&c#a#b!>|#b#g&c#g#h!>|#h#i&c#i#j!>|#j#k!>|#k#m&c#m#n!>|#n#o&c#p;'S&c;'S;=`&w<%lO&c7`!@hX!X7`OY!@cZ!P!@c!P!Q!AT!Q!}!@c!}#O!Ar#O#P!Bq#P;'S!@c;'S;=`!CQ<%lO!@c7`!AYW!X7`#W#X!AT#Z#[!AT#]#^!AT#a#b!AT#g#h!AT#i#j!AT#j#k!AT#m#n!AT7`!AuVOY!ArZ#O!Ar#O#P!B[#P#Q!@c#Q;'S!Ar;'S;=`!Bk<%lO!Ar7`!B_SOY!ArZ;'S!Ar;'S;=`!Bk<%lO!Ar7`!BnP;=`<%l!Ar7`!BtSOY!@cZ;'S!@c;'S;=`!CQ<%lO!@c7`!CTP;=`<%l!@c<z!C][$j&jOY!CWYZ&cZ!^!CW!^!_!Ar!_#O!CW#O#P!DR#P#Q!=y#Q#o!CW#o#p!Ar#p;'S!CW;'S;=`!Ds<%lO!CW<z!DWX$j&jOY!CWYZ&cZ!^!CW!^!_!Ar!_#o!CW#o#p!Ar#p;'S!CW;'S;=`!Ds<%lO!CW<z!DvP;=`<%l!CW<z!EOX$j&jOY!=yYZ&cZ!^!=y!^!_!@c!_#o!=y#o#p!@c#p;'S!=y;'S;=`!Ek<%lO!=y<z!EnP;=`<%l!=y>^!Ezl$j&j([!b!X7`OY&}YZ&cZw&}wx&cx!^&}!^!_'}!_#O&}#O#P&c#P#W&}#W#X!Eq#X#Z&}#Z#[!Eq#[#]&}#]#^!Eq#^#a&}#a#b!Eq#b#g&}#g#h!Eq#h#i&}#i#j!Eq#j#k!Eq#k#m&}#m#n!Eq#n#o&}#o#p'}#p;'S&};'S;=`(l<%lO&}8r!GyZ([!b!X7`OY!GrZw!Grwx!@cx!P!Gr!P!Q!Hl!Q!}!Gr!}#O!JU#O#P!Bq#P;'S!Gr;'S;=`!J|<%lO!Gr8r!Hse([!b!X7`OY'}Zw'}x#O'}#P#W'}#W#X!Hl#X#Z'}#Z#[!Hl#[#]'}#]#^!Hl#^#a'}#a#b!Hl#b#g'}#g#h!Hl#h#i'}#i#j!Hl#j#k!Hl#k#m'}#m#n!Hl#n;'S'};'S;=`(f<%lO'}8r!JZX([!bOY!JUZw!JUwx!Arx#O!JU#O#P!B[#P#Q!Gr#Q;'S!JU;'S;=`!Jv<%lO!JU8r!JyP;=`<%l!JU8r!KPP;=`<%l!Gr>^!KZ^$j&j([!bOY!KSYZ&cZw!KSwx!CWx!^!KS!^!_!JU!_#O!KS#O#P!DR#P#Q!<n#Q#o!KS#o#p!JU#p;'S!KS;'S;=`!LV<%lO!KS>^!LYP;=`<%l!KS>^!L`P;=`<%l!<n=l!Ll`$j&j(Xp!X7`OY!LcYZ&cZr!Lcrs!=ys!P!Lc!P!Q!Mn!Q!^!Lc!^!_# o!_!}!Lc!}#O#%P#O#P!Dy#P#o!Lc#o#p# o#p;'S!Lc;'S;=`#&Y<%lO!Lc=l!Mwl$j&j(Xp!X7`OY(rYZ&cZr(rrs&cs!^(r!^!_)r!_#O(r#O#P&c#P#W(r#W#X!Mn#X#Z(r#Z#[!Mn#[#](r#]#^!Mn#^#a(r#a#b!Mn#b#g(r#g#h!Mn#h#i(r#i#j!Mn#j#k!Mn#k#m(r#m#n!Mn#n#o(r#o#p)r#p;'S(r;'S;=`*a<%lO(r8Q# vZ(Xp!X7`OY# oZr# ors!@cs!P# o!P!Q#!i!Q!}# o!}#O#$R#O#P!Bq#P;'S# o;'S;=`#$y<%lO# o8Q#!pe(Xp!X7`OY)rZr)rs#O)r#P#W)r#W#X#!i#X#Z)r#Z#[#!i#[#])r#]#^#!i#^#a)r#a#b#!i#b#g)r#g#h#!i#h#i)r#i#j#!i#j#k#!i#k#m)r#m#n#!i#n;'S)r;'S;=`*Z<%lO)r8Q#$WX(XpOY#$RZr#$Rrs!Ars#O#$R#O#P!B[#P#Q# o#Q;'S#$R;'S;=`#$s<%lO#$R8Q#$vP;=`<%l#$R8Q#$|P;=`<%l# o=l#%W^$j&j(XpOY#%PYZ&cZr#%Prs!CWs!^#%P!^!_#$R!_#O#%P#O#P!DR#P#Q!Lc#Q#o#%P#o#p#$R#p;'S#%P;'S;=`#&S<%lO#%P=l#&VP;=`<%l#%P=l#&]P;=`<%l!Lc?O#&kn$j&j(Xp([!b!X7`OY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#W%Z#W#X#&`#X#Z%Z#Z#[#&`#[#]%Z#]#^#&`#^#a%Z#a#b#&`#b#g%Z#g#h#&`#h#i%Z#i#j#&`#j#k#&`#k#m%Z#m#n#&`#n#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z9d#(r](Xp([!b!X7`OY#(iZr#(irs!Grsw#(iwx# ox!P#(i!P!Q#)k!Q!}#(i!}#O#+`#O#P!Bq#P;'S#(i;'S;=`#,`<%lO#(i9d#)th(Xp([!b!X7`OY*gZr*grs'}sw*gwx)rx#O*g#P#W*g#W#X#)k#X#Z*g#Z#[#)k#[#]*g#]#^#)k#^#a*g#a#b#)k#b#g*g#g#h#)k#h#i*g#i#j#)k#j#k#)k#k#m*g#m#n#)k#n;'S*g;'S;=`+Z<%lO*g9d#+gZ(Xp([!bOY#+`Zr#+`rs!JUsw#+`wx#$Rx#O#+`#O#P!B[#P#Q#(i#Q;'S#+`;'S;=`#,Y<%lO#+`9d#,]P;=`<%l#+`9d#,cP;=`<%l#(i?O#,o`$j&j(Xp([!bOY#,fYZ&cZr#,frs!KSsw#,fwx#%Px!^#,f!^!_#+`!_#O#,f#O#P!DR#P#Q!;Z#Q#o#,f#o#p#+`#p;'S#,f;'S;=`#-q<%lO#,f?O#-tP;=`<%l#,f?O#-zP;=`<%l!;Z07[#.[b$j&j(Xp([!b(P0/l!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z07[#/o_$j&j(Xp([!bT0/lOY#/dYZ&cZr#/drs#0nsw#/dwx#4Ox!^#/d!^!_#5}!_#O#/d#O#P#1p#P#o#/d#o#p#5}#p;'S#/d;'S;=`#6|<%lO#/d06j#0w]$j&j([!bT0/lOY#0nYZ&cZw#0nwx#1px!^#0n!^!_#3R!_#O#0n#O#P#1p#P#o#0n#o#p#3R#p;'S#0n;'S;=`#3x<%lO#0n05W#1wX$j&jT0/lOY#1pYZ&cZ!^#1p!^!_#2d!_#o#1p#o#p#2d#p;'S#1p;'S;=`#2{<%lO#1p0/l#2iST0/lOY#2dZ;'S#2d;'S;=`#2u<%lO#2d0/l#2xP;=`<%l#2d05W#3OP;=`<%l#1p01O#3YW([!bT0/lOY#3RZw#3Rwx#2dx#O#3R#O#P#2d#P;'S#3R;'S;=`#3r<%lO#3R01O#3uP;=`<%l#3R06j#3{P;=`<%l#0n05x#4X]$j&j(XpT0/lOY#4OYZ&cZr#4Ors#1ps!^#4O!^!_#5Q!_#O#4O#O#P#1p#P#o#4O#o#p#5Q#p;'S#4O;'S;=`#5w<%lO#4O00^#5XW(XpT0/lOY#5QZr#5Qrs#2ds#O#5Q#O#P#2d#P;'S#5Q;'S;=`#5q<%lO#5Q00^#5tP;=`<%l#5Q05x#5zP;=`<%l#4O01p#6WY(Xp([!bT0/lOY#5}Zr#5}rs#3Rsw#5}wx#5Qx#O#5}#O#P#2d#P;'S#5};'S;=`#6v<%lO#5}01p#6yP;=`<%l#5}07[#7PP;=`<%l#/d)3h#7ab$j&j$R(Ch(Xp([!b!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;ZAt#8vb$[#t$j&j(Xp([!b!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z'Ad#:Zp$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!3Y!P!Q%Z!Q![#<_![!^%Z!^!_*g!_!g%Z!g!h!4|!h#O%Z#O#P&c#P#R%Z#R#S#<_#S#U%Z#U#V#?i#V#X%Z#X#Y!4|#Y#b%Z#b#c#>_#c#d#Bq#d#l%Z#l#m#Es#m#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#<jk$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!3Y!P!Q%Z!Q![#<_![!^%Z!^!_*g!_!g%Z!g!h!4|!h#O%Z#O#P&c#P#R%Z#R#S#<_#S#X%Z#X#Y!4|#Y#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#>j_$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#?rd$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!R#AQ!R!S#AQ!S!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#AQ#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#A]f$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!R#AQ!R!S#AQ!S!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#AQ#S#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#Bzc$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!Y#DV!Y!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#DV#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#Dbe$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!Y#DV!Y!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#DV#S#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#E|g$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![#Ge![!^%Z!^!_*g!_!c%Z!c!i#Ge!i#O%Z#O#P&c#P#R%Z#R#S#Ge#S#T%Z#T#Z#Ge#Z#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#Gpi$j&j(Xp([!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![#Ge![!^%Z!^!_*g!_!c%Z!c!i#Ge!i#O%Z#O#P&c#P#R%Z#R#S#Ge#S#T%Z#T#Z#Ge#Z#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z*)x#Il_!g$b$j&j$P)Lv(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z)[#Jv_al$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z04f#LS^h#)`#R-<U(Xp([!b$o7`OY*gZr*grs'}sw*gwx)rx!P*g!P!Q#MO!Q!^*g!^!_#Mt!_!`$ f!`#O*g#P;'S*g;'S;=`+Z<%lO*g(n#MXX$l&j(Xp([!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g(El#M}Z#s(Ch(Xp([!bOY*gZr*grs'}sw*gwx)rx!_*g!_!`#Np!`#O*g#P;'S*g;'S;=`+Z<%lO*g(El#NyX$R(Ch(Xp([!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g(El$ oX#t(Ch(Xp([!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g*)x$!ga#`*!Y$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`0z!`!a$#l!a#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(K[$#w_#l(Cl$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z*)x$%Vag!*r#t(Ch$g#|$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`$&[!`!a$'f!a#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$&g_#t(Ch$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$'qa#s(Ch$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`!a$(v!a#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$)R`#s(Ch$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(Kd$*`a(s(Ct$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!a%Z!a!b$+e!b#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$+p`$j&j#|(Ch(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z%#`$,}_!|$Ip$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z04f$.X_!S0,v$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(n$/]Z$j&jO!^$0O!^!_$0f!_#i$0O#i#j$0k#j#l$0O#l#m$2^#m#o$0O#o#p$0f#p;'S$0O;'S;=`$4i<%lO$0O(n$0VT_#S$j&jO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c#S$0kO_#S(n$0p[$j&jO!Q&c!Q![$1f![!^&c!_!c&c!c!i$1f!i#T&c#T#Z$1f#Z#o&c#o#p$3|#p;'S&c;'S;=`&w<%lO&c(n$1kZ$j&jO!Q&c!Q![$2^![!^&c!_!c&c!c!i$2^!i#T&c#T#Z$2^#Z#o&c#p;'S&c;'S;=`&w<%lO&c(n$2cZ$j&jO!Q&c!Q![$3U![!^&c!_!c&c!c!i$3U!i#T&c#T#Z$3U#Z#o&c#p;'S&c;'S;=`&w<%lO&c(n$3ZZ$j&jO!Q&c!Q![$0O![!^&c!_!c&c!c!i$0O!i#T&c#T#Z$0O#Z#o&c#p;'S&c;'S;=`&w<%lO&c#S$4PR!Q![$4Y!c!i$4Y#T#Z$4Y#S$4]S!Q![$4Y!c!i$4Y#T#Z$4Y#q#r$0f(n$4lP;=`<%l$0O#1[$4z_!Y#)l$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$6U`#y(Ch$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z+;p$7c_$j&j(Xp([!b(b+4QOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[$8qk$j&j(Xp([!b(U,2j$`#t(f$I[OY%ZYZ&cZr%Zrs&}st%Ztu$8buw%Zwx(rx}%Z}!O$:f!O!Q%Z!Q![$8b![!^%Z!^!_*g!_!c%Z!c!}$8b!}#O%Z#O#P&c#P#R%Z#R#S$8b#S#T%Z#T#o$8b#o#p*g#p$g%Z$g;'S$8b;'S;=`$<l<%lO$8b+d$:qk$j&j(Xp([!b$`#tOY%ZYZ&cZr%Zrs&}st%Ztu$:fuw%Zwx(rx}%Z}!O$:f!O!Q%Z!Q![$:f![!^%Z!^!_*g!_!c%Z!c!}$:f!}#O%Z#O#P&c#P#R%Z#R#S$:f#S#T%Z#T#o$:f#o#p*g#p$g%Z$g;'S$:f;'S;=`$<f<%lO$:f+d$<iP;=`<%l$:f07[$<oP;=`<%l$8b#Jf$<{X!_#Hb(Xp([!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g,#x$=sa(z+JY$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p#q$+e#q;'S%Z;'S;=`+a<%lO%Z)>v$?V_!^(CdvBr$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z?O$@a_!q7`$j&j(Xp([!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[$Aq|$j&j(Xp([!b'}0/l$^#t(U,2j(f$I[OX%ZXY+gYZ&cZ[+g[p%Zpq+gqr%Zrs&}st%ZtuEruw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Er![!^%Z!^!_*g!_!c%Z!c!}Er!}#O%Z#O#P&c#P#R%Z#R#SEr#S#T%Z#T#oEr#o#p*g#p$f%Z$f$g+g$g#BYEr#BY#BZ$A`#BZ$ISEr$IS$I_$A`$I_$JTEr$JT$JU$A`$JU$KVEr$KV$KW$A`$KW&FUEr&FU&FV$A`&FV;'SEr;'S;=`I|<%l?HTEr?HT?HU$A`?HUOEr07[$D|k$j&j(Xp([!b(O0/l$^#t(U,2j(f$I[OY%ZYZ&cZr%Zrs&}st%ZtuEruw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Er![!^%Z!^!_*g!_!c%Z!c!}Er!}#O%Z#O#P&c#P#R%Z#R#SEr#S#T%Z#T#oEr#o#p*g#p$g%Z$g;'SEr;'S;=`I|<%lOEr",
  tokenizers: [mb, gb, Qb, Sb, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, pb, new Nr("$S~RRtu[#O#Pg#S#T#|~_P#o#pb~gOx~~jVO#i!P#i#j!U#j#l!P#l#m!q#m;'S!P;'S;=`#v<%lO!P~!UO!U~~!XS!Q![!e!c!i!e#T#Z!e#o#p#Z~!hR!Q![!q!c!i!q#T#Z!q~!tR!Q![!}!c!i!}#T#Z!}~#QR!Q![!P!c!i!P#T#Z!P~#^R!Q![#g!c!i#g#T#Z#g~#jS!Q![#g!c!i#g#T#Z#g#q#r!P~#yP;=`<%l!P~$RO(d~~", 141, 341), new Nr("j~RQYZXz{^~^O(R~~aP!P!Qd~iO(S~~", 25, 324)],
  topRules: { Script: [0, 7], SingleExpression: [1, 277], SingleClassItem: [2, 278] },
  dialects: { jsx: 0, ts: 15152 },
  dynamicPrecedences: { 80: 1, 82: 1, 94: 1, 170: 1, 200: 1 },
  specialized: [{ term: 328, get: (n) => yb[n] || -1 }, { term: 344, get: (n) => kb[n] || -1 }, { term: 95, get: (n) => $b[n] || -1 }],
  tokenPrec: 15178
}), td = [
  /* @__PURE__ */ ee("function ${name}(${params}) {\n	${}\n}", {
    label: "function",
    detail: "definition",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("for (let ${index} = 0; ${index} < ${bound}; ${index}++) {\n	${}\n}", {
    label: "for",
    detail: "loop",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("for (let ${name} of ${collection}) {\n	${}\n}", {
    label: "for",
    detail: "of loop",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("do {\n	${}\n} while (${})", {
    label: "do",
    detail: "loop",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("while (${}) {\n	${}\n}", {
    label: "while",
    detail: "loop",
    type: "keyword"
  }),
  /* @__PURE__ */ ee(`try {
	\${}
} catch (\${error}) {
	\${}
}`, {
    label: "try",
    detail: "/ catch block",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("if (${}) {\n	${}\n}", {
    label: "if",
    detail: "block",
    type: "keyword"
  }),
  /* @__PURE__ */ ee(`if (\${}) {
	\${}
} else {
	\${}
}`, {
    label: "if",
    detail: "/ else block",
    type: "keyword"
  }),
  /* @__PURE__ */ ee(`class \${name} {
	constructor(\${params}) {
		\${}
	}
}`, {
    label: "class",
    detail: "definition",
    type: "keyword"
  }),
  /* @__PURE__ */ ee('import {${names}} from "${module}"\n${}', {
    label: "import",
    detail: "named",
    type: "keyword"
  }),
  /* @__PURE__ */ ee('import ${name} from "${module}"\n${}', {
    label: "import",
    detail: "default",
    type: "keyword"
  })
], Pb = /* @__PURE__ */ td.concat([
  /* @__PURE__ */ ee("interface ${name} {\n	${}\n}", {
    label: "interface",
    detail: "definition",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("type ${name} = ${type}", {
    label: "type",
    detail: "definition",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("enum ${name} {\n	${}\n}", {
    label: "enum",
    detail: "definition",
    type: "keyword"
  })
]), hO = /* @__PURE__ */ new jl(), id = /* @__PURE__ */ new Set([
  "Script",
  "Block",
  "FunctionExpression",
  "FunctionDeclaration",
  "ArrowFunction",
  "MethodDeclaration",
  "ForStatement"
]);
function Gi(n) {
  return (e, t) => {
    let i = e.node.getChild("VariableDefinition");
    return i && t(i, n), !0;
  };
}
const wb = ["FunctionDeclaration"], vb = {
  FunctionDeclaration: /* @__PURE__ */ Gi("function"),
  ClassDeclaration: /* @__PURE__ */ Gi("class"),
  ClassExpression: () => !0,
  EnumDeclaration: /* @__PURE__ */ Gi("constant"),
  TypeAliasDeclaration: /* @__PURE__ */ Gi("type"),
  NamespaceDeclaration: /* @__PURE__ */ Gi("namespace"),
  VariableDefinition(n, e) {
    n.matchContext(wb) || e(n, "variable");
  },
  TypeDefinition(n, e) {
    e(n, "type");
  },
  __proto__: null
};
function nd(n, e) {
  let t = hO.get(e);
  if (t)
    return t;
  let i = [], r = !0;
  function s(o, l) {
    let a = n.sliceString(o.from, o.to);
    i.push({ label: a, type: l });
  }
  return e.cursor(V.IncludeAnonymous).iterate((o) => {
    if (r)
      r = !1;
    else if (o.name) {
      let l = vb[o.name];
      if (l && l(o, s) || id.has(o.name))
        return !1;
    } else if (o.to - o.from > 8192) {
      for (let l of nd(n, o.node))
        i.push(l);
      return !1;
    }
  }), hO.set(e, i), i;
}
const OO = /^[\w$\xa1-\uffff][\w$\d\xa1-\uffff]*$/, rd = [
  "TemplateString",
  "String",
  "RegExp",
  "LineComment",
  "BlockComment",
  "VariableDefinition",
  "TypeDefinition",
  "Label",
  "PropertyDefinition",
  "PropertyName",
  "PrivatePropertyDefinition",
  "PrivatePropertyName",
  "JSXText",
  "JSXAttributeValue",
  "JSXOpenTag",
  "JSXCloseTag",
  "JSXSelfClosingTag",
  ".",
  "?."
];
function Tb(n) {
  let e = I(n.state).resolveInner(n.pos, -1);
  if (rd.indexOf(e.name) > -1)
    return null;
  let t = e.name == "VariableName" || e.to - e.from < 20 && OO.test(n.state.sliceDoc(e.from, e.to));
  if (!t && !n.explicit)
    return null;
  let i = [];
  for (let r = e; r; r = r.parent)
    id.has(r.name) && (i = i.concat(nd(n.state.doc, r)));
  return {
    options: i,
    from: t ? e.from : n.pos,
    validFor: OO
  };
}
const Ot = /* @__PURE__ */ Et.define({
  name: "javascript",
  parser: /* @__PURE__ */ xb.configure({
    props: [
      /* @__PURE__ */ Bt.add({
        IfStatement: /* @__PURE__ */ wi({ except: /^\s*({|else\b)/ }),
        TryStatement: /* @__PURE__ */ wi({ except: /^\s*({|catch\b|finally\b)/ }),
        LabeledStatement: z0,
        SwitchBody: (n) => {
          let e = n.textAfter, t = /^\s*\}/.test(e), i = /^\s*(case|default)\b/.test(e);
          return n.baseIndent + (t ? 0 : i ? 1 : 2) * n.unit;
        },
        Block: /* @__PURE__ */ mr({ closing: "}" }),
        ArrowFunction: (n) => n.baseIndent + n.unit,
        "TemplateString BlockComment": () => null,
        "Statement Property": /* @__PURE__ */ wi({ except: /^\s*{/ }),
        JSXElement(n) {
          let e = /^\s*<\//.test(n.textAfter);
          return n.lineIndent(n.node.from) + (e ? 0 : n.unit);
        },
        JSXEscape(n) {
          let e = /\s*\}/.test(n.textAfter);
          return n.lineIndent(n.node.from) + (e ? 0 : n.unit);
        },
        "JSXOpenTag JSXSelfClosingTag"(n) {
          return n.column(n.node.from) + n.unit;
        }
      }),
      /* @__PURE__ */ It.add({
        "Block ClassBody SwitchBody EnumBody ObjectExpression ArrayExpression ObjectType": cs,
        BlockComment(n) {
          return { from: n.from + 2, to: n.to - 2 };
        },
        JSXElement(n) {
          let e = n.firstChild;
          if (!e || e.name == "JSXSelfClosingTag")
            return null;
          let t = n.lastChild;
          return { from: e.to, to: t.type.isError ? n.to : t.from };
        },
        "JSXSelfClosingTag JSXOpenTag"(n) {
          var e;
          let t = (e = n.firstChild) === null || e === void 0 ? void 0 : e.nextSibling, i = n.lastChild;
          return !t || t.type.isError ? null : { from: t.to, to: i.type.isError ? n.to : i.from };
        }
      })
    ]
  }),
  languageData: {
    closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    indentOnInput: /^\s*(?:case |default:|\{|\}|<\/)$/,
    wordChars: "$"
  }
}), sd = {
  test: (n) => /^JSX/.test(n.name),
  facet: /* @__PURE__ */ hs({ commentTokens: { block: { open: "{/*", close: "*/}" } } })
}, od = /* @__PURE__ */ Ot.configure({ dialect: "ts" }, "typescript"), ld = /* @__PURE__ */ Ot.configure({
  dialect: "jsx",
  props: [/* @__PURE__ */ Wl.add((n) => n.isTop ? [sd] : void 0)]
}), ad = /* @__PURE__ */ Ot.configure({
  dialect: "jsx ts",
  props: [/* @__PURE__ */ Wl.add((n) => n.isTop ? [sd] : void 0)]
}, "typescript");
let hd = (n) => ({ label: n, type: "keyword" });
const Od = /* @__PURE__ */ "break case const continue default delete export extends false finally in instanceof let new return static super switch this throw true typeof var yield".split(" ").map(hd), Xb = /* @__PURE__ */ Od.concat(/* @__PURE__ */ ["declare", "implements", "private", "protected", "public"].map(hd));
function Cb(n = {}) {
  let e = n.jsx ? n.typescript ? ad : ld : n.typescript ? od : Ot, t = n.typescript ? Pb.concat(Xb) : td.concat(Od);
  return new ai(e, [
    Ot.data.of({
      autocomplete: Uu(rd, Gl(t))
    }),
    Ot.data.of({
      autocomplete: Tb
    }),
    n.jsx ? Ab : []
  ]);
}
function Zb(n) {
  for (; ; ) {
    if (n.name == "JSXOpenTag" || n.name == "JSXSelfClosingTag" || n.name == "JSXFragmentTag")
      return n;
    if (n.name == "JSXEscape" || !n.parent)
      return null;
    n = n.parent;
  }
}
function cO(n, e, t = n.length) {
  for (let i = e?.firstChild; i; i = i.nextSibling)
    if (i.name == "JSXIdentifier" || i.name == "JSXBuiltin" || i.name == "JSXNamespacedName" || i.name == "JSXMemberExpression")
      return n.sliceString(i.from, Math.min(i.to, t));
  return "";
}
const Rb = typeof navigator == "object" && /* @__PURE__ */ /Android\b/.test(navigator.userAgent), Ab = /* @__PURE__ */ T.inputHandler.of((n, e, t, i, r) => {
  if ((Rb ? n.composing : n.compositionStarted) || n.state.readOnly || e != t || i != ">" && i != "/" || !Ot.isActiveAt(n.state, e, -1))
    return !1;
  let s = r(), { state: o } = s, l = o.changeByRange((a) => {
    var h;
    let { head: O } = a, c = I(o).resolveInner(O - 1, -1), f;
    if (c.name == "JSXStartTag" && (c = c.parent), !(o.doc.sliceString(O - 1, O) != i || c.name == "JSXAttributeValue" && c.to > O)) {
      if (i == ">" && c.name == "JSXFragmentTag")
        return { range: a, changes: { from: O, insert: "</>" } };
      if (i == "/" && c.name == "JSXStartCloseTag") {
        let u = c.parent, d = u.parent;
        if (d && u.from == O - 2 && ((f = cO(o.doc, d.firstChild, O)) || ((h = d.firstChild) === null || h === void 0 ? void 0 : h.name) == "JSXFragmentTag")) {
          let p = `${f}>`;
          return { range: S.cursor(O + p.length, -1), changes: { from: O, insert: p } };
        }
      } else if (i == ">") {
        let u = Zb(c);
        if (u && u.name == "JSXOpenTag" && !/^\/?>|^<\//.test(o.doc.sliceString(O, O + 2)) && (f = cO(o.doc, u, O)))
          return { range: a, changes: { from: O, insert: `</${f}>` } };
      }
    }
    return { range: a };
  });
  return l.changes.empty ? !1 : (n.dispatch([
    s,
    o.update(l, { userEvent: "input.complete", scrollIntoView: !0 })
  ]), !0);
}), qb = Dt({
  String: m.string,
  Number: m.number,
  "True False": m.bool,
  PropertyName: m.propertyName,
  Null: m.null,
  ", :": m.separator,
  "[ ]": m.squareBracket,
  "{ }": m.brace
}), jb = Yt.deserialize({
  version: 14,
  states: "$bOVQPOOOOQO'#Cb'#CbOnQPO'#CeOvQPO'#ClOOQO'#Cr'#CrQOQPOOOOQO'#Cg'#CgO}QPO'#CfO!SQPO'#CtOOQO,59P,59PO![QPO,59PO!aQPO'#CuOOQO,59W,59WO!iQPO,59WOVQPO,59QOqQPO'#CmO!nQPO,59`OOQO1G.k1G.kOVQPO'#CnO!vQPO,59aOOQO1G.r1G.rOOQO1G.l1G.lOOQO,59X,59XOOQO-E6k-E6kOOQO,59Y,59YOOQO-E6l-E6l",
  stateData: "#O~OeOS~OQSORSOSSOTSOWQO_ROgPO~OVXOgUO~O^[O~PVO[^O~O]_OVhX~OVaO~O]bO^iX~O^dO~O]_OVha~O]bO^ia~O",
  goto: "!kjPPPPPPkPPkqwPPPPk{!RPPP!XP!e!hXSOR^bQWQRf_TVQ_Q`WRg`QcZRicQTOQZRQe^RhbRYQR]R",
  nodeNames: "⚠ JsonText True False Null Number String } { Object Property PropertyName : , ] [ Array",
  maxTerm: 25,
  nodeProps: [
    ["isolate", -2, 6, 11, ""],
    ["openedBy", 7, "{", 14, "["],
    ["closedBy", 8, "}", 15, "]"]
  ],
  propSources: [qb],
  skippedNodes: [0],
  repeatNodeCount: 2,
  tokenData: "(|~RaXY!WYZ!W]^!Wpq!Wrs!]|}$u}!O$z!Q!R%T!R![&c![!]&t!}#O&y#P#Q'O#Y#Z'T#b#c'r#h#i(Z#o#p(r#q#r(w~!]Oe~~!`Wpq!]qr!]rs!xs#O!]#O#P!}#P;'S!];'S;=`$o<%lO!]~!}Og~~#QXrs!]!P!Q!]#O#P!]#U#V!]#Y#Z!]#b#c!]#f#g!]#h#i!]#i#j#m~#pR!Q![#y!c!i#y#T#Z#y~#|R!Q![$V!c!i$V#T#Z$V~$YR!Q![$c!c!i$c#T#Z$c~$fR!Q![!]!c!i!]#T#Z!]~$rP;=`<%l!]~$zO]~~$}Q!Q!R%T!R![&c~%YRT~!O!P%c!g!h%w#X#Y%w~%fP!Q![%i~%nRT~!Q![%i!g!h%w#X#Y%w~%zR{|&T}!O&T!Q![&Z~&WP!Q![&Z~&`PT~!Q![&Z~&hST~!O!P%c!Q![&c!g!h%w#X#Y%w~&yO[~~'OO_~~'TO^~~'WP#T#U'Z~'^P#`#a'a~'dP#g#h'g~'jP#X#Y'm~'rOR~~'uP#i#j'x~'{P#`#a(O~(RP#`#a(U~(ZOS~~(^P#f#g(a~(dP#i#j(g~(jP#X#Y(m~(rOQ~~(wOW~~(|OV~",
  tokenizers: [0],
  topRules: { JsonText: [0, 1] },
  tokenPrec: 0
}), Wb = /* @__PURE__ */ Et.define({
  name: "json",
  parser: /* @__PURE__ */ jb.configure({
    props: [
      /* @__PURE__ */ Bt.add({
        Object: /* @__PURE__ */ wi({ except: /^\s*\}/ }),
        Array: /* @__PURE__ */ wi({ except: /^\s*\]/ })
      }),
      /* @__PURE__ */ It.add({
        "Object Array": cs
      })
    ]
  }),
  languageData: {
    closeBrackets: { brackets: ["[", "{", '"'] },
    indentOnInput: /^\s*[\}\]]$/
  }
});
function Dx() {
  return new ai(Wb);
}
const zb = 1, cd = 194, fd = 195, Mb = 196, fO = 197, _b = 198, Eb = 199, Lb = 200, Yb = 2, ud = 3, uO = 201, Vb = 24, Ub = 25, Db = 49, Bb = 50, Ib = 55, Gb = 56, Nb = 57, Fb = 59, Hb = 60, Kb = 61, Jb = 62, ey = 63, ty = 65, iy = 238, ny = 71, ry = 241, sy = 242, oy = 243, ly = 244, ay = 245, hy = 246, Oy = 247, cy = 248, dd = 72, fy = 249, uy = 250, dy = 251, py = 252, my = 253, gy = 254, Qy = 255, Sy = 256, by = 73, yy = 77, ky = 263, $y = 112, xy = 130, Py = 151, wy = 152, vy = 155, ci = 10, Pn = 13, ra = 32, Ss = 9, sa = 35, Ty = 40, Xy = 46, ll = 123, dO = 125, pd = 39, md = 34, pO = 92, Cy = 111, Zy = 120, Ry = 78, Ay = 117, qy = 85, jy = /* @__PURE__ */ new Set([
  Ub,
  Db,
  Bb,
  ky,
  ty,
  xy,
  Gb,
  Nb,
  iy,
  Jb,
  ey,
  dd,
  by,
  yy,
  Hb,
  Kb,
  Py,
  wy,
  vy,
  $y
]);
function Fs(n) {
  return n == ci || n == Pn;
}
function Hs(n) {
  return n >= 48 && n <= 57 || n >= 65 && n <= 70 || n >= 97 && n <= 102;
}
const Wy = new de((n, e) => {
  let t;
  if (n.next < 0)
    n.acceptToken(Eb);
  else if (e.context.flags & Qr)
    Fs(n.next) && n.acceptToken(_b, 1);
  else if (((t = n.peek(-1)) < 0 || Fs(t)) && e.canShift(fO)) {
    let i = 0;
    for (; n.next == ra || n.next == Ss; )
      n.advance(), i++;
    (n.next == ci || n.next == Pn || n.next == sa) && n.acceptToken(fO, -i);
  } else Fs(n.next) && n.acceptToken(Mb, 1);
}, { contextual: !0 }), zy = new de((n, e) => {
  let t = e.context;
  if (t.flags) return;
  let i = n.peek(-1);
  if (i == ci || i == Pn) {
    let r = 0, s = 0;
    for (; ; ) {
      if (n.next == ra) r++;
      else if (n.next == Ss) r += 8 - r % 8;
      else break;
      n.advance(), s++;
    }
    r != t.indent && n.next != ci && n.next != Pn && n.next != sa && (r < t.indent ? n.acceptToken(fd, -s) : n.acceptToken(cd));
  }
}), Qr = 1, gd = 2, dt = 4, pt = 8, mt = 16, gt = 32;
function Sr(n, e, t) {
  this.parent = n, this.indent = e, this.flags = t, this.hash = (n ? n.hash + n.hash << 8 : 0) + e + (e << 4) + t + (t << 6);
}
const My = new Sr(null, 0, 0);
function _y(n) {
  let e = 0;
  for (let t = 0; t < n.length; t++)
    e += n.charCodeAt(t) == Ss ? 8 - e % 8 : 1;
  return e;
}
const mO = new Map([
  [ry, 0],
  [sy, dt],
  [oy, pt],
  [ly, pt | dt],
  [ay, mt],
  [hy, mt | dt],
  [Oy, mt | pt],
  [cy, mt | pt | dt],
  [fy, gt],
  [uy, gt | dt],
  [dy, gt | pt],
  [py, gt | pt | dt],
  [my, gt | mt],
  [gy, gt | mt | dt],
  [Qy, gt | mt | pt],
  [Sy, gt | mt | pt | dt]
].map(([n, e]) => [n, e | gd])), Ey = new na({
  start: My,
  reduce(n, e, t, i) {
    return n.flags & Qr && jy.has(e) || (e == ny || e == dd) && n.flags & gd ? n.parent : n;
  },
  shift(n, e, t, i) {
    return e == cd ? new Sr(n, _y(i.read(i.pos, t.pos)), 0) : e == fd ? n.parent : e == Vb || e == Ib || e == Fb || e == ud ? new Sr(n, 0, Qr) : mO.has(e) ? new Sr(n, 0, mO.get(e) | n.flags & Qr) : n;
  },
  hash(n) {
    return n.hash;
  }
}), Ly = new de((n) => {
  for (let e = 0; e < 5; e++) {
    if (n.next != "print".charCodeAt(e)) return;
    n.advance();
  }
  if (!/\w/.test(String.fromCharCode(n.next)))
    for (let e = 0; ; e++) {
      let t = n.peek(e);
      if (!(t == ra || t == Ss)) {
        t != Ty && t != Xy && t != ci && t != Pn && t != sa && n.acceptToken(zb);
        return;
      }
    }
}), Yy = new de((n, e) => {
  let { flags: t } = e.context, i = t & dt ? md : pd, r = (t & pt) > 0, s = !(t & mt), o = (t & gt) > 0, l = n.pos;
  for (; !(n.next < 0); )
    if (o && n.next == ll)
      if (n.peek(1) == ll)
        n.advance(2);
      else {
        if (n.pos == l) {
          n.acceptToken(ud, 1);
          return;
        }
        break;
      }
    else if (s && n.next == pO) {
      if (n.pos == l) {
        n.advance();
        let a = n.next;
        a >= 0 && (n.advance(), Vy(n, a)), n.acceptToken(Yb);
        return;
      }
      break;
    } else if (n.next == pO && !s && n.peek(1) > -1)
      n.advance(2);
    else if (n.next == i && (!r || n.peek(1) == i && n.peek(2) == i)) {
      if (n.pos == l) {
        n.acceptToken(uO, r ? 3 : 1);
        return;
      }
      break;
    } else if (n.next == ci) {
      if (r)
        n.advance();
      else if (n.pos == l) {
        n.acceptToken(uO);
        return;
      }
      break;
    } else
      n.advance();
  n.pos > l && n.acceptToken(Lb);
});
function Vy(n, e) {
  if (e == Cy)
    for (let t = 0; t < 2 && n.next >= 48 && n.next <= 55; t++) n.advance();
  else if (e == Zy)
    for (let t = 0; t < 2 && Hs(n.next); t++) n.advance();
  else if (e == Ay)
    for (let t = 0; t < 4 && Hs(n.next); t++) n.advance();
  else if (e == qy)
    for (let t = 0; t < 8 && Hs(n.next); t++) n.advance();
  else if (e == Ry && n.next == ll) {
    for (n.advance(); n.next >= 0 && n.next != dO && n.next != pd && n.next != md && n.next != ci; ) n.advance();
    n.next == dO && n.advance();
  }
}
const Uy = Dt({
  'async "*" "**" FormatConversion FormatSpec': m.modifier,
  "for while if elif else try except finally return raise break continue with pass assert await yield match case": m.controlKeyword,
  "in not and or is del": m.operatorKeyword,
  "from def class global nonlocal lambda": m.definitionKeyword,
  import: m.moduleKeyword,
  "with as print": m.keyword,
  Boolean: m.bool,
  None: m.null,
  VariableName: m.variableName,
  "CallExpression/VariableName": m.function(m.variableName),
  "FunctionDefinition/VariableName": m.function(m.definition(m.variableName)),
  "ClassDefinition/VariableName": m.definition(m.className),
  PropertyName: m.propertyName,
  "CallExpression/MemberExpression/PropertyName": m.function(m.propertyName),
  Comment: m.lineComment,
  Number: m.number,
  String: m.string,
  FormatString: m.special(m.string),
  Escape: m.escape,
  UpdateOp: m.updateOperator,
  "ArithOp!": m.arithmeticOperator,
  BitOp: m.bitwiseOperator,
  CompareOp: m.compareOperator,
  AssignOp: m.definitionOperator,
  Ellipsis: m.punctuation,
  At: m.meta,
  "( )": m.paren,
  "[ ]": m.squareBracket,
  "{ }": m.brace,
  ".": m.derefOperator,
  ", ;": m.separator
}), Dy = { __proto__: null, await: 44, or: 54, and: 56, in: 60, not: 62, is: 64, if: 70, else: 72, lambda: 76, yield: 94, from: 96, async: 102, for: 104, None: 162, True: 164, False: 164, del: 178, pass: 182, break: 186, continue: 190, return: 194, raise: 202, import: 206, as: 208, global: 212, nonlocal: 214, assert: 218, type: 223, elif: 236, while: 240, try: 246, except: 248, finally: 250, with: 254, def: 258, class: 268, match: 279, case: 285 }, By = Yt.deserialize({
  version: 14,
  states: "##jQ`QeOOP$}OSOOO&WQtO'#HUOOQS'#Co'#CoOOQS'#Cp'#CpO'vQdO'#CnO*UQtO'#HTOOQS'#HU'#HUOOQS'#DU'#DUOOQS'#HT'#HTO*rQdO'#D_O+VQdO'#DfO+gQdO'#DjO+zOWO'#DuO,VOWO'#DvO.[QtO'#GuOOQS'#Gu'#GuO'vQdO'#GtO0ZQtO'#GtOOQS'#Eb'#EbO0rQdO'#EcOOQS'#Gs'#GsO0|QdO'#GrOOQV'#Gr'#GrO1XQdO'#FYOOQS'#G^'#G^O1^QdO'#FXOOQV'#IS'#ISOOQV'#Gq'#GqOOQV'#Fq'#FqQ`QeOOO'vQdO'#CqO1lQdO'#C}O1sQdO'#DRO2RQdO'#HYO2cQtO'#EVO'vQdO'#EWOOQS'#EY'#EYOOQS'#E['#E[OOQS'#E^'#E^O2wQdO'#E`O3_QdO'#EdO3rQdO'#EfO3zQtO'#EfO1XQdO'#EiO0rQdO'#ElO1XQdO'#EnO0rQdO'#EtO0rQdO'#EwO4VQdO'#EyO4^QdO'#FOO4iQdO'#EzO0rQdO'#FOO1XQdO'#FQO1XQdO'#FVO4nQdO'#F[P4uOdO'#GpPOOO)CBd)CBdOOQS'#Ce'#CeOOQS'#Cf'#CfOOQS'#Cg'#CgOOQS'#Ch'#ChOOQS'#Ci'#CiOOQS'#Cj'#CjOOQS'#Cl'#ClO'vQdO,59OO'vQdO,59OO'vQdO,59OO'vQdO,59OO'vQdO,59OO'vQdO,59OO5TQdO'#DoOOQS,5:Y,5:YO5hQdO'#HdOOQS,5:],5:]O5uQ!fO,5:]O5zQtO,59YO1lQdO,59bO1lQdO,59bO1lQdO,59bO8jQdO,59bO8oQdO,59bO8vQdO,59jO8}QdO'#HTO:TQdO'#HSOOQS'#HS'#HSOOQS'#D['#D[O:lQdO,59aO'vQdO,59aO:zQdO,59aOOQS,59y,59yO;PQdO,5:RO'vQdO,5:ROOQS,5:Q,5:QO;_QdO,5:QO;dQdO,5:XO'vQdO,5:XO'vQdO,5:VOOQS,5:U,5:UO;uQdO,5:UO;zQdO,5:WOOOW'#Fy'#FyO<POWO,5:aOOQS,5:a,5:aO<[QdO'#HwOOOW'#Dw'#DwOOOW'#Fz'#FzO<lOWO,5:bOOQS,5:b,5:bOOQS'#F}'#F}O<zQtO,5:iO?lQtO,5=`O@VQ#xO,5=`O@vQtO,5=`OOQS,5:},5:}OA_QeO'#GWOBqQdO,5;^OOQV,5=^,5=^OB|QtO'#IPOCkQdO,5;tOOQS-E:[-E:[OOQV,5;s,5;sO4dQdO'#FQOOQV-E9o-E9oOCsQtO,59]OEzQtO,59iOFeQdO'#HVOFpQdO'#HVO1XQdO'#HVOF{QdO'#DTOGTQdO,59mOGYQdO'#HZO'vQdO'#HZO0rQdO,5=tOOQS,5=t,5=tO0rQdO'#EROOQS'#ES'#ESOGwQdO'#GPOHXQdO,58|OHXQdO,58|O*xQdO,5:oOHgQtO'#H]OOQS,5:r,5:rOOQS,5:z,5:zOHzQdO,5;OOI]QdO'#IOO1XQdO'#H}OOQS,5;Q,5;QOOQS'#GT'#GTOIqQtO,5;QOJPQdO,5;QOJUQdO'#IQOOQS,5;T,5;TOJdQdO'#H|OOQS,5;W,5;WOJuQdO,5;YO4iQdO,5;`O4iQdO,5;cOJ}QtO'#ITO'vQdO'#ITOKXQdO,5;eO4VQdO,5;eO0rQdO,5;jO1XQdO,5;lOK^QeO'#EuOLjQgO,5;fO!!kQdO'#IUO4iQdO,5;jO!!vQdO,5;lO!#OQdO,5;qO!#ZQtO,5;vO'vQdO,5;vPOOO,5=[,5=[P!#bOSO,5=[P!#jOdO,5=[O!&bQtO1G.jO!&iQtO1G.jO!)YQtO1G.jO!)dQtO1G.jO!+}QtO1G.jO!,bQtO1G.jO!,uQdO'#HcO!-TQtO'#GuO0rQdO'#HcO!-_QdO'#HbOOQS,5:Z,5:ZO!-gQdO,5:ZO!-lQdO'#HeO!-wQdO'#HeO!.[QdO,5>OOOQS'#Ds'#DsOOQS1G/w1G/wOOQS1G.|1G.|O!/[QtO1G.|O!/cQtO1G.|O1lQdO1G.|O!0OQdO1G/UOOQS'#DZ'#DZO0rQdO,59tOOQS1G.{1G.{O!0VQdO1G/eO!0gQdO1G/eO!0oQdO1G/fO'vQdO'#H[O!0tQdO'#H[O!0yQtO1G.{O!1ZQdO,59iO!2aQdO,5=zO!2qQdO,5=zO!2yQdO1G/mO!3OQtO1G/mOOQS1G/l1G/lO!3`QdO,5=uO!4VQdO,5=uO0rQdO1G/qO!4tQdO1G/sO!4yQtO1G/sO!5ZQtO1G/qOOQS1G/p1G/pOOQS1G/r1G/rOOOW-E9w-E9wOOQS1G/{1G/{O!5kQdO'#HxO0rQdO'#HxO!5|QdO,5>cOOOW-E9x-E9xOOQS1G/|1G/|OOQS-E9{-E9{O!6[Q#xO1G2zO!6{QtO1G2zO'vQdO,5<jOOQS,5<j,5<jOOQS-E9|-E9|OOQS,5<r,5<rOOQS-E:U-E:UOOQV1G0x1G0xO1XQdO'#GRO!7dQtO,5>kOOQS1G1`1G1`O!8RQdO1G1`OOQS'#DV'#DVO0rQdO,5=qOOQS,5=q,5=qO!8WQdO'#FrO!8cQdO,59oO!8kQdO1G/XO!8uQtO,5=uOOQS1G3`1G3`OOQS,5:m,5:mO!9fQdO'#GtOOQS,5<k,5<kOOQS-E9}-E9}O!9wQdO1G.hOOQS1G0Z1G0ZO!:VQdO,5=wO!:gQdO,5=wO0rQdO1G0jO0rQdO1G0jO!:xQdO,5>jO!;ZQdO,5>jO1XQdO,5>jO!;lQdO,5>iOOQS-E:R-E:RO!;qQdO1G0lO!;|QdO1G0lO!<RQdO,5>lO!<aQdO,5>lO!<oQdO,5>hO!=VQdO,5>hO!=hQdO'#EpO0rQdO1G0tO!=sQdO1G0tO!=xQgO1G0zO!AvQgO1G0}O!EqQdO,5>oO!E{QdO,5>oO!FTQtO,5>oO0rQdO1G1PO!F_QdO1G1PO4iQdO1G1UO!!vQdO1G1WOOQV,5;a,5;aO!FdQfO,5;aO!FiQgO1G1QO!JjQdO'#GZO4iQdO1G1QO4iQdO1G1QO!JzQdO,5>pO!KXQdO,5>pO1XQdO,5>pOOQV1G1U1G1UO!KaQdO'#FSO!KrQ!fO1G1WO!KzQdO1G1WOOQV1G1]1G1]O4iQdO1G1]O!LPQdO1G1]O!LXQdO'#F^OOQV1G1b1G1bO!#ZQtO1G1bPOOO1G2v1G2vP!L^OSO1G2vOOQS,5=},5=}OOQS'#Dp'#DpO0rQdO,5=}O!LfQdO,5=|O!LyQdO,5=|OOQS1G/u1G/uO!MRQdO,5>PO!McQdO,5>PO!MkQdO,5>PO!NOQdO,5>PO!N`QdO,5>POOQS1G3j1G3jOOQS7+$h7+$hO!8kQdO7+$pO#!RQdO1G.|O#!YQdO1G.|OOQS1G/`1G/`OOQS,5<`,5<`O'vQdO,5<`OOQS7+%P7+%PO#!aQdO7+%POOQS-E9r-E9rOOQS7+%Q7+%QO#!qQdO,5=vO'vQdO,5=vOOQS7+$g7+$gO#!vQdO7+%PO##OQdO7+%QO##TQdO1G3fOOQS7+%X7+%XO##eQdO1G3fO##mQdO7+%XOOQS,5<_,5<_O'vQdO,5<_O##rQdO1G3aOOQS-E9q-E9qO#$iQdO7+%]OOQS7+%_7+%_O#$wQdO1G3aO#%fQdO7+%_O#%kQdO1G3gO#%{QdO1G3gO#&TQdO7+%]O#&YQdO,5>dO#&sQdO,5>dO#&sQdO,5>dOOQS'#Dx'#DxO#'UO&jO'#DzO#'aO`O'#HyOOOW1G3}1G3}O#'fQdO1G3}O#'nQdO1G3}O#'yQ#xO7+(fO#(jQtO1G2UP#)TQdO'#GOOOQS,5<m,5<mOOQS-E:P-E:POOQS7+&z7+&zOOQS1G3]1G3]OOQS,5<^,5<^OOQS-E9p-E9pOOQS7+$s7+$sO#)bQdO,5=`O#){QdO,5=`O#*^QtO,5<aO#*qQdO1G3cOOQS-E9s-E9sOOQS7+&U7+&UO#+RQdO7+&UO#+aQdO,5<nO#+uQdO1G4UOOQS-E:Q-E:QO#,WQdO1G4UOOQS1G4T1G4TOOQS7+&W7+&WO#,iQdO7+&WOOQS,5<p,5<pO#,tQdO1G4WOOQS-E:S-E:SOOQS,5<l,5<lO#-SQdO1G4SOOQS-E:O-E:OO1XQdO'#EqO#-jQdO'#EqO#-uQdO'#IRO#-}QdO,5;[OOQS7+&`7+&`O0rQdO7+&`O#.SQgO7+&fO!JmQdO'#GXO4iQdO7+&fO4iQdO7+&iO#2QQtO,5<tO'vQdO,5<tO#2[QdO1G4ZOOQS-E:W-E:WO#2fQdO1G4ZO4iQdO7+&kO0rQdO7+&kOOQV7+&p7+&pO!KrQ!fO7+&rO!KzQdO7+&rO`QeO1G0{OOQV-E:X-E:XO4iQdO7+&lO4iQdO7+&lOOQV,5<u,5<uO#2nQdO,5<uO!JmQdO,5<uOOQV7+&l7+&lO#2yQgO7+&lO#6tQdO,5<vO#7PQdO1G4[OOQS-E:Y-E:YO#7^QdO1G4[O#7fQdO'#IWO#7tQdO'#IWO1XQdO'#IWOOQS'#IW'#IWO#8PQdO'#IVOOQS,5;n,5;nO#8XQdO,5;nO0rQdO'#FUOOQV7+&r7+&rO4iQdO7+&rOOQV7+&w7+&wO4iQdO7+&wO#8^QfO,5;xOOQV7+&|7+&|POOO7+(b7+(bO#8cQdO1G3iOOQS,5<c,5<cO#8qQdO1G3hOOQS-E9u-E9uO#9UQdO,5<dO#9aQdO,5<dO#9tQdO1G3kOOQS-E9v-E9vO#:UQdO1G3kO#:^QdO1G3kO#:nQdO1G3kO#:UQdO1G3kOOQS<<H[<<H[O#:yQtO1G1zOOQS<<Hk<<HkP#;WQdO'#FtO8vQdO1G3bO#;eQdO1G3bO#;jQdO<<HkOOQS<<Hl<<HlO#;zQdO7+)QOOQS<<Hs<<HsO#<[QtO1G1yP#<{QdO'#FsO#=YQdO7+)RO#=jQdO7+)RO#=rQdO<<HwO#=wQdO7+({OOQS<<Hy<<HyO#>nQdO,5<bO'vQdO,5<bOOQS-E9t-E9tOOQS<<Hw<<HwOOQS,5<g,5<gO0rQdO,5<gO#>sQdO1G4OOOQS-E9y-E9yO#?^QdO1G4OO<[QdO'#H{OOOO'#D{'#D{OOOO'#F|'#F|O#?oO&jO,5:fOOOW,5>e,5>eOOOW7+)i7+)iO#?zQdO7+)iO#@SQdO1G2zO#@mQdO1G2zP'vQdO'#FuO0rQdO<<IpO1XQdO1G2YP1XQdO'#GSO#AOQdO7+)pO#AaQdO7+)pOOQS<<Ir<<IrP1XQdO'#GUP0rQdO'#GQOOQS,5;],5;]O#ArQdO,5>mO#BQQdO,5>mOOQS1G0v1G0vOOQS<<Iz<<IzOOQV-E:V-E:VO4iQdO<<JQOOQV,5<s,5<sO4iQdO,5<sOOQV<<JQ<<JQOOQV<<JT<<JTO#BYQtO1G2`P#BdQdO'#GYO#BkQdO7+)uO#BuQgO<<JVO4iQdO<<JVOOQV<<J^<<J^O4iQdO<<J^O!KrQ!fO<<J^O#FpQgO7+&gOOQV<<JW<<JWO#FzQgO<<JWOOQV1G2a1G2aO1XQdO1G2aO#JuQdO1G2aO4iQdO<<JWO1XQdO1G2bP0rQdO'#G[O#KQQdO7+)vO#K_QdO7+)vOOQS'#FT'#FTO0rQdO,5>rO#KgQdO,5>rO#KrQdO,5>rO#K}QdO,5>qO#L`QdO,5>qOOQS1G1Y1G1YOOQS,5;p,5;pOOQV<<Jc<<JcO#LhQdO1G1dOOQS7+)T7+)TP#LmQdO'#FwO#L}QdO1G2OO#MbQdO1G2OO#MrQdO1G2OP#M}QdO'#FxO#N[QdO7+)VO#NlQdO7+)VO#NlQdO7+)VO#NtQdO7+)VO$ UQdO7+(|O8vQdO7+(|OOQSAN>VAN>VO$ oQdO<<LmOOQSAN>cAN>cO0rQdO1G1|O$!PQtO1G1|P$!ZQdO'#FvOOQS1G2R1G2RP$!hQdO'#F{O$!uQdO7+)jO$#`QdO,5>gOOOO-E9z-E9zOOOW<<MT<<MTO$#nQdO7+(fOOQSAN?[AN?[OOQS7+'t7+'tO$$XQdO<<M[OOQS,5<q,5<qO$$jQdO1G4XOOQS-E:T-E:TOOQVAN?lAN?lOOQV1G2_1G2_O4iQdOAN?qO$$xQgOAN?qOOQVAN?xAN?xO4iQdOAN?xOOQV<<JR<<JRO4iQdOAN?rO4iQdO7+'{OOQV7+'{7+'{O1XQdO7+'{OOQVAN?rAN?rOOQS7+'|7+'|O$(sQdO<<MbOOQS1G4^1G4^O0rQdO1G4^OOQS,5<w,5<wO$)QQdO1G4]OOQS-E:Z-E:ZOOQU'#G_'#G_O$)cQfO7+'OO$)nQdO'#F_O$*uQdO7+'jO$+VQdO7+'jOOQS7+'j7+'jO$+bQdO<<LqO$+rQdO<<LqO$+rQdO<<LqO$+zQdO'#H^OOQS<<Lh<<LhO$,UQdO<<LhOOQS7+'h7+'hOOQS'#D|'#D|OOOO1G4R1G4RO$,oQdO1G4RO$,wQdO1G4RP!=hQdO'#GVOOQVG25]G25]O4iQdOG25]OOQVG25dG25dOOQVG25^G25^OOQV<<Kg<<KgO4iQdO<<KgOOQS7+)x7+)xP$-SQdO'#G]OOQU-E:]-E:]OOQV<<Jj<<JjO$-vQtO'#FaOOQS'#Fc'#FcO$.WQdO'#FbO$.xQdO'#FbOOQS'#Fb'#FbO$.}QdO'#IYO$)nQdO'#FiO$)nQdO'#FiO$/fQdO'#FjO$)nQdO'#FkO$/mQdO'#IZOOQS'#IZ'#IZO$0[QdO,5;yOOQS<<KU<<KUO$0dQdO<<KUO$0tQdOANB]O$1UQdOANB]O$1^QdO'#H_OOQS'#H_'#H_O1sQdO'#DcO$1wQdO,5=xOOQSANBSANBSOOOO7+)m7+)mO$2`QdO7+)mOOQVLD*wLD*wOOQVANARANARO5uQ!fO'#GaO$2hQtO,5<SO$)nQdO'#FmOOQS,5<W,5<WOOQS'#Fd'#FdO$3YQdO,5;|O$3_QdO,5;|OOQS'#Fg'#FgO$)nQdO'#G`O$4PQdO,5<QO$4kQdO,5>tO$4{QdO,5>tO1XQdO,5<PO$5^QdO,5<TO$5cQdO,5<TO$)nQdO'#I[O$5hQdO'#I[O$5mQdO,5<UOOQS,5<V,5<VO0rQdO'#FpOOQU1G1e1G1eO4iQdO1G1eOOQSAN@pAN@pO$5rQdOG27wO$6SQdO,59}OOQS1G3d1G3dOOOO<<MX<<MXOOQS,5<{,5<{OOQS-E:_-E:_O$6XQtO'#FaO$6`QdO'#I]O$6nQdO'#I]O$6vQdO,5<XOOQS1G1h1G1hO$6{QdO1G1hO$7QQdO,5<zOOQS-E:^-E:^O$7lQdO,5=OO$8TQdO1G4`OOQS-E:b-E:bOOQS1G1k1G1kOOQS1G1o1G1oO$8eQdO,5>vO$)nQdO,5>vOOQS1G1p1G1pOOQS,5<[,5<[OOQU7+'P7+'PO$+zQdO1G/iO$)nQdO,5<YO$8sQdO,5>wO$8zQdO,5>wOOQS1G1s1G1sOOQS7+'S7+'SP$)nQdO'#GdO$9SQdO1G4bO$9^QdO1G4bO$9fQdO1G4bOOQS7+%T7+%TO$9tQdO1G1tO$:SQtO'#FaO$:ZQdO,5<}OOQS,5<},5<}O$:iQdO1G4cOOQS-E:a-E:aO$)nQdO,5<|O$:pQdO,5<|O$:uQdO7+)|OOQS-E:`-E:`O$;PQdO7+)|O$)nQdO,5<ZP$)nQdO'#GcO$;XQdO1G2hO$)nQdO1G2hP$;gQdO'#GbO$;nQdO<<MhO$;xQdO1G1uO$<WQdO7+(SO8vQdO'#C}O8vQdO,59bO8vQdO,59bO8vQdO,59bO$<fQtO,5=`O8vQdO1G.|O0rQdO1G/XO0rQdO7+$pP$<yQdO'#GOO'vQdO'#GtO$=WQdO,59bO$=]QdO,59bO$=dQdO,59mO$=iQdO1G/UO1sQdO'#DRO8vQdO,59j",
  stateData: "$>S~O%cOS%^OSSOS%]PQ~OPdOVaOfoOhYOopOs!POvqO!PrO!Q{O!T!SO!U!RO!XZO!][O!h`O!r`O!s`O!t`O!{tO!}uO#PvO#RwO#TxO#XyO#ZzO#^|O#_|O#a}O#c!OO#l!QO#o!TO#s!UO#u!VO#z!WO#}hO$P!XO%oRO%pRO%tSO%uWO&Z]O&[]O&]]O&^]O&_]O&`]O&a]O&b]O&c^O&d^O&e^O&f^O&g^O&h^O&i^O&j^O~O%]!YO~OV!aO_!aOa!bOh!iO!X!kO!f!mO%j![O%k!]O%l!^O%m!_O%n!_O%o!`O%p!`O%q!aO%r!aO%s!aO~Ok%xXl%xXm%xXn%xXo%xXp%xXs%xXz%xX{%xX!x%xX#g%xX%[%xX%_%xX%z%xXg%xX!T%xX!U%xX%{%xX!W%xX![%xX!Q%xX#[%xXt%xX!m%xX~P%SOfoOhYO!XZO!][O!h`O!r`O!s`O!t`O%oRO%pRO%tSO%uWO&Z]O&[]O&]]O&^]O&_]O&`]O&a]O&b]O&c^O&d^O&e^O&f^O&g^O&h^O&i^O&j^O~Oz%wX{%wX#g%wX%[%wX%_%wX%z%wX~Ok!pOl!qOm!oOn!oOo!rOp!sOs!tO!x%wX~P)pOV!zOg!|Oo0cOv0qO!PrO~P'vOV#OOo0cOv0qO!W#PO~P'vOV#SOa#TOo0cOv0qO![#UO~P'vOQ#XO%`#XO%a#ZO~OQ#^OR#[O%`#^O%a#`O~OV%iX_%iXa%iXh%iXk%iXl%iXm%iXn%iXo%iXp%iXs%iXz%iX!X%iX!f%iX%j%iX%k%iX%l%iX%m%iX%n%iX%o%iX%p%iX%q%iX%r%iX%s%iXg%iX!T%iX!U%iX~O&Z]O&[]O&]]O&^]O&_]O&`]O&a]O&b]O&c^O&d^O&e^O&f^O&g^O&h^O&i^O&j^O{%iX!x%iX#g%iX%[%iX%_%iX%z%iX%{%iX!W%iX![%iX!Q%iX#[%iXt%iX!m%iX~P,eOz#dO{%hX!x%hX#g%hX%[%hX%_%hX%z%hX~Oo0cOv0qO~P'vO#g#gO%[#iO%_#iO~O%uWO~O!T#nO#u!VO#z!WO#}hO~OopO~P'vOV#sOa#tO%uWO{wP~OV#xOo0cOv0qO!Q#yO~P'vO{#{O!x$QO%z#|O#g!yX%[!yX%_!yX~OV#xOo0cOv0qO#g#SX%[#SX%_#SX~P'vOo0cOv0qO#g#WX%[#WX%_#WX~P'vOh$WO%uWO~O!f$YO!r$YO%uWO~OV$eO~P'vO!U$gO#s$hO#u$iO~O{$jO~OV$qO~P'vOS$sO%[$rO%_$rO%c$tO~OV$}Oa$}Og%POo0cOv0qO~P'vOo0cOv0qO{%SO~P'vO&Y%UO~Oa!bOh!iO!X!kO!f!mOVba_bakbalbambanbaobapbasbazba{ba!xba#gba%[ba%_ba%jba%kba%lba%mba%nba%oba%pba%qba%rba%sba%zbagba!Tba!Uba%{ba!Wba![ba!Qba#[batba!mba~On%ZO~Oo%ZO~P'vOo0cO~P'vOk0eOl0fOm0dOn0dOo0mOp0nOs0rOg%wX!T%wX!U%wX%{%wX!W%wX![%wX!Q%wX#[%wX!m%wX~P)pO%{%]Og%vXz%vX!T%vX!U%vX!W%vX{%vX~Og%_Oz%`O!T%dO!U%cO~Og%_O~Oz%gO!T%dO!U%cO!W&SX~O!W%kO~Oz%lO{%nO!T%dO!U%cO![%}X~O![%rO~O![%sO~OQ#XO%`#XO%a%uO~OV%wOo0cOv0qO!PrO~P'vOQ#^OR#[O%`#^O%a%zO~OV!qa_!qaa!qah!qak!qal!qam!qan!qao!qap!qas!qaz!qa{!qa!X!qa!f!qa!x!qa#g!qa%[!qa%_!qa%j!qa%k!qa%l!qa%m!qa%n!qa%o!qa%p!qa%q!qa%r!qa%s!qa%z!qag!qa!T!qa!U!qa%{!qa!W!qa![!qa!Q!qa#[!qat!qa!m!qa~P#yOz%|O{%ha!x%ha#g%ha%[%ha%_%ha%z%ha~P%SOV&OOopOvqO{%ha!x%ha#g%ha%[%ha%_%ha%z%ha~P'vOz%|O{%ha!x%ha#g%ha%[%ha%_%ha%z%ha~OPdOVaOopOvqO!PrO!Q{O!{tO!}uO#PvO#RwO#TxO#XyO#ZzO#^|O#_|O#a}O#c!OO#g$zX%[$zX%_$zX~P'vO#g#gO%[&TO%_&TO~O!f&UOh&sX%[&sXz&sX#[&sX#g&sX%_&sX#Z&sXg&sX~Oh!iO%[&WO~Okealeameaneaoeapeaseazea{ea!xea#gea%[ea%_ea%zeagea!Tea!Uea%{ea!Wea![ea!Qea#[eatea!mea~P%SOsqazqa{qa#gqa%[qa%_qa%zqa~Ok!pOl!qOm!oOn!oOo!rOp!sO!xqa~PEcO%z&YOz%yX{%yX~O%uWOz%yX{%yX~Oz&]O{wX~O{&_O~Oz%lO#g%}X%[%}X%_%}Xg%}X{%}X![%}X!m%}X%z%}X~OV0lOo0cOv0qO!PrO~P'vO%z#|O#gUa%[Ua%_Ua~Oz&hO#g&PX%[&PX%_&PXn&PX~P%SOz&kO!Q&jO#g#Wa%[#Wa%_#Wa~Oz&lO#[&nO#g&rX%[&rX%_&rXg&rX~O!f$YO!r$YO#Z&qO%uWO~O#Z&qO~Oz&sO#g&tX%[&tX%_&tX~Oz&uO#g&pX%[&pX%_&pX{&pX~O!X&wO%z&xO~Oz&|On&wX~P%SOn'PO~OPdOVaOopOvqO!PrO!Q{O!{tO!}uO#PvO#RwO#TxO#XyO#ZzO#^|O#_|O#a}O#c!OO%['UO~P'vOt'YO#p'WO#q'XOP#naV#naf#nah#nao#nas#nav#na!P#na!Q#na!T#na!U#na!X#na!]#na!h#na!r#na!s#na!t#na!{#na!}#na#P#na#R#na#T#na#X#na#Z#na#^#na#_#na#a#na#c#na#l#na#o#na#s#na#u#na#z#na#}#na$P#na%X#na%o#na%p#na%t#na%u#na&Z#na&[#na&]#na&^#na&_#na&`#na&a#na&b#na&c#na&d#na&e#na&f#na&g#na&h#na&i#na&j#na%Z#na%_#na~Oz'ZO#[']O{&xX~Oh'_O!X&wO~Oh!iO{$jO!X&wO~O{'eO~P%SO%['hO%_'hO~OS'iO%['hO%_'hO~OV!aO_!aOa!bOh!iO!X!kO!f!mO%l!^O%m!_O%n!_O%o!`O%p!`O%q!aO%r!aO%s!aOkWilWimWinWioWipWisWizWi{Wi!xWi#gWi%[Wi%_Wi%jWi%zWigWi!TWi!UWi%{Wi!WWi![Wi!QWi#[WitWi!mWi~O%k!]O~P!#uO%kWi~P!#uOV!aO_!aOa!bOh!iO!X!kO!f!mO%o!`O%p!`O%q!aO%r!aO%s!aOkWilWimWinWioWipWisWizWi{Wi!xWi#gWi%[Wi%_Wi%jWi%kWi%lWi%zWigWi!TWi!UWi%{Wi!WWi![Wi!QWi#[WitWi!mWi~O%m!_O%n!_O~P!&pO%mWi%nWi~P!&pOa!bOh!iO!X!kO!f!mOkWilWimWinWioWipWisWizWi{Wi!xWi#gWi%[Wi%_Wi%jWi%kWi%lWi%mWi%nWi%oWi%pWi%zWigWi!TWi!UWi%{Wi!WWi![Wi!QWi#[WitWi!mWi~OV!aO_!aO%q!aO%r!aO%s!aO~P!)nOVWi_Wi%qWi%rWi%sWi~P!)nO!T%dO!U%cOg&VXz&VX~O%z'kO%{'kO~P,eOz'mOg&UX~Og'oO~Oz'pO{'rO!W&XX~Oo0cOv0qOz'pO{'sO!W&XX~P'vO!W'uO~Om!oOn!oOo!rOp!sOkjisjizji{ji!xji#gji%[ji%_ji%zji~Ol!qO~P!.aOlji~P!.aOk0eOl0fOm0dOn0dOo0mOp0nO~Ot'wO~P!/jOV'|Og'}Oo0cOv0qO~P'vOg'}Oz(OO~Og(QO~O!U(SO~Og(TOz(OO!T%dO!U%cO~P%SOk0eOl0fOm0dOn0dOo0mOp0nOgqa!Tqa!Uqa%{qa!Wqa![qa!Qqa#[qatqa!mqa~PEcOV'|Oo0cOv0qO!W&Sa~P'vOz(WO!W&Sa~O!W(XO~Oz(WO!T%dO!U%cO!W&Sa~P%SOV(]Oo0cOv0qO![%}a#g%}a%[%}a%_%}ag%}a{%}a!m%}a%z%}a~P'vOz(^O![%}a#g%}a%[%}a%_%}ag%}a{%}a!m%}a%z%}a~O![(aO~Oz(^O!T%dO!U%cO![%}a~P%SOz(dO!T%dO!U%cO![&Ta~P%SOz(gO{&lX![&lX!m&lX%z&lX~O{(kO![(mO!m(nO%z(jO~OV&OOopOvqO{%hi!x%hi#g%hi%[%hi%_%hi%z%hi~P'vOz(pO{%hi!x%hi#g%hi%[%hi%_%hi%z%hi~O!f&UOh&sa%[&saz&sa#[&sa#g&sa%_&sa#Z&sag&sa~O%[(uO~OV#sOa#tO%uWO~Oz&]O{wa~OopOvqO~P'vOz(^O#g%}a%[%}a%_%}ag%}a{%}a![%}a!m%}a%z%}a~P%SOz(zO#g%hX%[%hX%_%hX%z%hX~O%z#|O#gUi%[Ui%_Ui~O#g&Pa%[&Pa%_&Pan&Pa~P'vOz(}O#g&Pa%[&Pa%_&Pan&Pa~O%uWO#g&ra%[&ra%_&rag&ra~Oz)SO#g&ra%[&ra%_&rag&ra~Og)VO~OV)WOh$WO%uWO~O#Z)XO~O%uWO#g&ta%[&ta%_&ta~Oz)ZO#g&ta%[&ta%_&ta~Oo0cOv0qO#g&pa%[&pa%_&pa{&pa~P'vOz)^O#g&pa%[&pa%_&pa{&pa~OV)`Oa)`O%uWO~O%z)eO~Ot)hO#j)gOP#hiV#hif#hih#hio#his#hiv#hi!P#hi!Q#hi!T#hi!U#hi!X#hi!]#hi!h#hi!r#hi!s#hi!t#hi!{#hi!}#hi#P#hi#R#hi#T#hi#X#hi#Z#hi#^#hi#_#hi#a#hi#c#hi#l#hi#o#hi#s#hi#u#hi#z#hi#}#hi$P#hi%X#hi%o#hi%p#hi%t#hi%u#hi&Z#hi&[#hi&]#hi&^#hi&_#hi&`#hi&a#hi&b#hi&c#hi&d#hi&e#hi&f#hi&g#hi&h#hi&i#hi&j#hi%Z#hi%_#hi~Ot)iOP#kiV#kif#kih#kio#kis#kiv#ki!P#ki!Q#ki!T#ki!U#ki!X#ki!]#ki!h#ki!r#ki!s#ki!t#ki!{#ki!}#ki#P#ki#R#ki#T#ki#X#ki#Z#ki#^#ki#_#ki#a#ki#c#ki#l#ki#o#ki#s#ki#u#ki#z#ki#}#ki$P#ki%X#ki%o#ki%p#ki%t#ki%u#ki&Z#ki&[#ki&]#ki&^#ki&_#ki&`#ki&a#ki&b#ki&c#ki&d#ki&e#ki&f#ki&g#ki&h#ki&i#ki&j#ki%Z#ki%_#ki~OV)kOn&wa~P'vOz)lOn&wa~Oz)lOn&wa~P%SOn)pO~O%Y)tO~Ot)wO#p'WO#q)vOP#niV#nif#nih#nio#nis#niv#ni!P#ni!Q#ni!T#ni!U#ni!X#ni!]#ni!h#ni!r#ni!s#ni!t#ni!{#ni!}#ni#P#ni#R#ni#T#ni#X#ni#Z#ni#^#ni#_#ni#a#ni#c#ni#l#ni#o#ni#s#ni#u#ni#z#ni#}#ni$P#ni%X#ni%o#ni%p#ni%t#ni%u#ni&Z#ni&[#ni&]#ni&^#ni&_#ni&`#ni&a#ni&b#ni&c#ni&d#ni&e#ni&f#ni&g#ni&h#ni&i#ni&j#ni%Z#ni%_#ni~OV)zOo0cOv0qO{$jO~P'vOo0cOv0qO{&xa~P'vOz*OO{&xa~OV*SOa*TOg*WO%q*UO%uWO~O{$jO&{*YO~Oh'_O~Oh!iO{$jO~O%[*_O~O%[*aO%_*aO~OV$}Oa$}Oo0cOv0qOg&Ua~P'vOz*dOg&Ua~Oo0cOv0qO{*gO!W&Xa~P'vOz*hO!W&Xa~Oo0cOv0qOz*hO{*kO!W&Xa~P'vOo0cOv0qOz*hO!W&Xa~P'vOz*hO{*kO!W&Xa~Om0dOn0dOo0mOp0nOgjikjisjizji!Tji!Uji%{ji!Wji{ji![ji#gji%[ji%_ji!Qji#[jitji!mji%zji~Ol0fO~P!NkOlji~P!NkOV'|Og*pOo0cOv0qO~P'vOn*rO~Og*pOz*tO~Og*uO~OV'|Oo0cOv0qO!W&Si~P'vOz*vO!W&Si~O!W*wO~OV(]Oo0cOv0qO![%}i#g%}i%[%}i%_%}ig%}i{%}i!m%}i%z%}i~P'vOz*zO!T%dO!U%cO![&Ti~Oz*}O![%}i#g%}i%[%}i%_%}ig%}i{%}i!m%}i%z%}i~O![+OO~Oa+QOo0cOv0qO![&Ti~P'vOz*zO![&Ti~O![+SO~OV+UOo0cOv0qO{&la![&la!m&la%z&la~P'vOz+VO{&la![&la!m&la%z&la~O!]+YO&n+[O![!nX~O![+^O~O{(kO![+_O~O{(kO![+_O!m+`O~OV&OOopOvqO{%hq!x%hq#g%hq%[%hq%_%hq%z%hq~P'vOz$ri{$ri!x$ri#g$ri%[$ri%_$ri%z$ri~P%SOV&OOopOvqO~P'vOV&OOo0cOv0qO#g%ha%[%ha%_%ha%z%ha~P'vOz+aO#g%ha%[%ha%_%ha%z%ha~Oz$ia#g$ia%[$ia%_$ian$ia~P%SO#g&Pi%[&Pi%_&Pin&Pi~P'vOz+dO#g#Wq%[#Wq%_#Wq~O#[+eOz$va#g$va%[$va%_$vag$va~O%uWO#g&ri%[&ri%_&rig&ri~Oz+gO#g&ri%[&ri%_&rig&ri~OV+iOh$WO%uWO~O%uWO#g&ti%[&ti%_&ti~Oo0cOv0qO#g&pi%[&pi%_&pi{&pi~P'vO{#{Oz#eX!W#eX~Oz+mO!W&uX~O!W+oO~Ot+rO#j)gOP#hqV#hqf#hqh#hqo#hqs#hqv#hq!P#hq!Q#hq!T#hq!U#hq!X#hq!]#hq!h#hq!r#hq!s#hq!t#hq!{#hq!}#hq#P#hq#R#hq#T#hq#X#hq#Z#hq#^#hq#_#hq#a#hq#c#hq#l#hq#o#hq#s#hq#u#hq#z#hq#}#hq$P#hq%X#hq%o#hq%p#hq%t#hq%u#hq&Z#hq&[#hq&]#hq&^#hq&_#hq&`#hq&a#hq&b#hq&c#hq&d#hq&e#hq&f#hq&g#hq&h#hq&i#hq&j#hq%Z#hq%_#hq~On$|az$|a~P%SOV)kOn&wi~P'vOz+yOn&wi~Oz,TO{$jO#[,TO~O#q,VOP#nqV#nqf#nqh#nqo#nqs#nqv#nq!P#nq!Q#nq!T#nq!U#nq!X#nq!]#nq!h#nq!r#nq!s#nq!t#nq!{#nq!}#nq#P#nq#R#nq#T#nq#X#nq#Z#nq#^#nq#_#nq#a#nq#c#nq#l#nq#o#nq#s#nq#u#nq#z#nq#}#nq$P#nq%X#nq%o#nq%p#nq%t#nq%u#nq&Z#nq&[#nq&]#nq&^#nq&_#nq&`#nq&a#nq&b#nq&c#nq&d#nq&e#nq&f#nq&g#nq&h#nq&i#nq&j#nq%Z#nq%_#nq~O#[,WOz%Oa{%Oa~Oo0cOv0qO{&xi~P'vOz,YO{&xi~O{#{O%z,[Og&zXz&zX~O%uWOg&zXz&zX~Oz,`Og&yX~Og,bO~O%Y,eO~O!T%dO!U%cOg&Viz&Vi~OV$}Oa$}Oo0cOv0qOg&Ui~P'vO{,hOz$la!W$la~Oo0cOv0qO{,iOz$la!W$la~P'vOo0cOv0qO{*gO!W&Xi~P'vOz,lO!W&Xi~Oo0cOv0qOz,lO!W&Xi~P'vOz,lO{,oO!W&Xi~Og$hiz$hi!W$hi~P%SOV'|Oo0cOv0qO~P'vOn,qO~OV'|Og,rOo0cOv0qO~P'vOV'|Oo0cOv0qO!W&Sq~P'vOz$gi![$gi#g$gi%[$gi%_$gig$gi{$gi!m$gi%z$gi~P%SOV(]Oo0cOv0qO~P'vOa+QOo0cOv0qO![&Tq~P'vOz,sO![&Tq~O![,tO~OV(]Oo0cOv0qO![%}q#g%}q%[%}q%_%}qg%}q{%}q!m%}q%z%}q~P'vO{,uO~OV+UOo0cOv0qO{&li![&li!m&li%z&li~P'vOz,zO{&li![&li!m&li%z&li~O!]+YO&n+[O![!na~O{(kO![,}O~OV&OOo0cOv0qO#g%hi%[%hi%_%hi%z%hi~P'vOz-OO#g%hi%[%hi%_%hi%z%hi~O%uWO#g&rq%[&rq%_&rqg&rq~Oz-RO#g&rq%[&rq%_&rqg&rq~OV)`Oa)`O%uWO!W&ua~Oz-TO!W&ua~On$|iz$|i~P%SOV)kO~P'vOV)kOn&wq~P'vOt-XOP#myV#myf#myh#myo#mys#myv#my!P#my!Q#my!T#my!U#my!X#my!]#my!h#my!r#my!s#my!t#my!{#my!}#my#P#my#R#my#T#my#X#my#Z#my#^#my#_#my#a#my#c#my#l#my#o#my#s#my#u#my#z#my#}#my$P#my%X#my%o#my%p#my%t#my%u#my&Z#my&[#my&]#my&^#my&_#my&`#my&a#my&b#my&c#my&d#my&e#my&f#my&g#my&h#my&i#my&j#my%Z#my%_#my~O%Z-]O%_-]O~P`O#q-^OP#nyV#nyf#nyh#nyo#nys#nyv#ny!P#ny!Q#ny!T#ny!U#ny!X#ny!]#ny!h#ny!r#ny!s#ny!t#ny!{#ny!}#ny#P#ny#R#ny#T#ny#X#ny#Z#ny#^#ny#_#ny#a#ny#c#ny#l#ny#o#ny#s#ny#u#ny#z#ny#}#ny$P#ny%X#ny%o#ny%p#ny%t#ny%u#ny&Z#ny&[#ny&]#ny&^#ny&_#ny&`#ny&a#ny&b#ny&c#ny&d#ny&e#ny&f#ny&g#ny&h#ny&i#ny&j#ny%Z#ny%_#ny~Oz-aO{$jO#[-aO~Oo0cOv0qO{&xq~P'vOz-dO{&xq~O%z,[Og&zaz&za~O{#{Og&zaz&za~OV*SOa*TO%q*UO%uWOg&ya~Oz-hOg&ya~O$S-lO~OV$}Oa$}Oo0cOv0qO~P'vOo0cOv0qO{-mOz$li!W$li~P'vOo0cOv0qOz$li!W$li~P'vO{-mOz$li!W$li~Oo0cOv0qO{*gO~P'vOo0cOv0qO{*gO!W&Xq~P'vOz-pO!W&Xq~Oo0cOv0qOz-pO!W&Xq~P'vOs-sO!T%dO!U%cOg&Oq!W&Oq![&Oqz&Oq~P!/jOa+QOo0cOv0qO![&Ty~P'vOz$ji![$ji~P%SOa+QOo0cOv0qO~P'vOV+UOo0cOv0qO~P'vOV+UOo0cOv0qO{&lq![&lq!m&lq%z&lq~P'vO{(kO![-xO!m-yO%z-wO~OV&OOo0cOv0qO#g%hq%[%hq%_%hq%z%hq~P'vO%uWO#g&ry%[&ry%_&ryg&ry~OV)`Oa)`O%uWO!W&ui~Ot-}OP#m!RV#m!Rf#m!Rh#m!Ro#m!Rs#m!Rv#m!R!P#m!R!Q#m!R!T#m!R!U#m!R!X#m!R!]#m!R!h#m!R!r#m!R!s#m!R!t#m!R!{#m!R!}#m!R#P#m!R#R#m!R#T#m!R#X#m!R#Z#m!R#^#m!R#_#m!R#a#m!R#c#m!R#l#m!R#o#m!R#s#m!R#u#m!R#z#m!R#}#m!R$P#m!R%X#m!R%o#m!R%p#m!R%t#m!R%u#m!R&Z#m!R&[#m!R&]#m!R&^#m!R&_#m!R&`#m!R&a#m!R&b#m!R&c#m!R&d#m!R&e#m!R&f#m!R&g#m!R&h#m!R&i#m!R&j#m!R%Z#m!R%_#m!R~Oo0cOv0qO{&xy~P'vOV*SOa*TO%q*UO%uWOg&yi~O$S-lO%Z.VO%_.VO~OV.aOh._O!X.^O!].`O!h.YO!s.[O!t.[O%p.XO%uWO&Z]O&[]O&]]O&^]O&_]O&`]O&a]O&b]O~Oo0cOv0qOz$lq!W$lq~P'vO{.fOz$lq!W$lq~Oo0cOv0qO{*gO!W&Xy~P'vOz.gO!W&Xy~Oo0cOv.kO~P'vOs-sO!T%dO!U%cOg&Oy!W&Oy![&Oyz&Oy~P!/jO{(kO![.nO~O{(kO![.nO!m.oO~OV*SOa*TO%q*UO%uWO~Oh.tO!f.rOz$TX#[$TX%j$TXg$TX~Os$TX{$TX!W$TX![$TX~P$-bO%o.vO%p.vOs$UXz$UX{$UX#[$UX%j$UX!W$UXg$UX![$UX~O!h.xO~Oz.|O#[/OO%j.yOs&|X{&|X!W&|Xg&|X~Oa/RO~P$)zOh.tOs&}Xz&}X{&}X#[&}X%j&}X!W&}Xg&}X![&}X~Os/VO{$jO~Oo0cOv0qOz$ly!W$ly~P'vOo0cOv0qO{*gO!W&X!R~P'vOz/ZO!W&X!R~Og&RXs&RX!T&RX!U&RX!W&RX![&RXz&RX~P!/jOs-sO!T%dO!U%cOg&Qa!W&Qa![&Qaz&Qa~O{(kO![/^O~O!f.rOh$[as$[az$[a{$[a#[$[a%j$[a!W$[ag$[a![$[a~O!h/eO~O%o.vO%p.vOs$Uaz$Ua{$Ua#[$Ua%j$Ua!W$Uag$Ua![$Ua~O%j.yOs$Yaz$Ya{$Ya#[$Ya!W$Yag$Ya![$Ya~Os&|a{&|a!W&|ag&|a~P$)nOz/jOs&|a{&|a!W&|ag&|a~O!W/mO~Og/mO~O{/oO~O![/pO~Oo0cOv0qO{*gO!W&X!Z~P'vO{/sO~O%z/tO~P$-bOz/uO#[/OO%j.yOg'PX~Oz/uOg'PX~Og/wO~O!h/xO~O#[/OOs%Saz%Sa{%Sa%j%Sa!W%Sag%Sa![%Sa~O#[/OO%j.yOs%Waz%Wa{%Wa!W%Wag%Wa~Os&|i{&|i!W&|ig&|i~P$)nOz/zO#[/OO%j.yO!['Oa~Og'Pa~P$)nOz0SOg'Pa~Oa0UO!['Oi~P$)zOz0WO!['Oi~Oz0WO#[/OO%j.yO!['Oi~O#[/OO%j.yOg$biz$bi~O%z0ZO~P$-bO#[/OO%j.yOg%Vaz%Va~Og'Pi~P$)nO{0^O~Oa0UO!['Oq~P$)zOz0`O!['Oq~O#[/OO%j.yOz%Ui![%Ui~Oa0UO~P$)zOa0UO!['Oy~P$)zO#[/OO%j.yOg$ciz$ci~O#[/OO%j.yOz%Uq![%Uq~Oz+aO#g%ha%[%ha%_%ha%z%ha~P%SOV&OOo0cOv0qO~P'vOn0hO~Oo0hO~P'vO{0iO~Ot0jO~P!/jO&]&Z&j&h&i&g&f&d&e&c&b&`&a&_&^&[%u~",
  goto: "!=j'QPPPPPP'RP'Z*s+[+t,_,y-fP.SP'Z.r.r'ZPPP'Z2[PPPPPP2[5PPP5PP7b7k=sPP=v>h>kPP'Z'ZPP>zPP'Z'ZPP'Z'Z'Z'Z'Z?O?w'ZP?zP@QDXGuGyPG|HWH['ZPPPH_Hk'RP'R'RP'RP'RP'RP'RP'R'R'RP'RPP'RPP'RP'RPHqH}IVPI^IdPI^PI^I^PPPI^PKrPK{LVL]KrPI^LfPI^PLmLsPLwM]MzNeLwLwNkNxLwLwLwLw! ^! d! g! l! o! y!!P!!]!!o!!u!#P!#V!#s!#y!$P!$Z!$a!$g!$y!%T!%Z!%a!%k!%q!%w!%}!&T!&Z!&e!&k!&u!&{!'U!'[!'k!'s!'}!(UPPPPPPPPPPP!([!(_!(e!(n!(x!)TPPPPPPPPPPPP!-u!/Z!3^!6oPP!6w!7W!7a!8Y!8P!8c!8i!8l!8o!8r!8z!9jPPPPPPPPPPPPPPPPP!9m!9q!9wP!:]!:a!:m!:v!;S!;j!;m!;p!;v!;|!<S!<VP!<_!<h!=d!=g]eOn#g$j)t,P'}`OTYZ[adnoprtxy}!P!Q!R!U!X!c!d!e!f!g!h!i!k!o!p!q!s!t!z#O#S#T#[#d#g#x#y#{#}$Q$e$g$h$j$q$}%S%Z%^%`%c%g%l%n%w%|&O&Z&_&h&j&k&u&x&|'P'W'Z'l'm'p'r's'w'|(O(S(W(](^(d(g(p(r(z(})^)e)g)k)l)p)t)z*O*Y*d*g*h*k*q*r*t*v*y*z*}+Q+U+V+Y+a+c+d+k+x+y,P,X,Y,],g,h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0l0n0r{!cQ#c#p$R$d$p%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g}!dQ#c#p$R$d$p$u%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g!P!eQ#c#p$R$d$p$u$v%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g!R!fQ#c#p$R$d$p$u$v$w%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g!T!gQ#c#p$R$d$p$u$v$w$x%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g!V!hQ#c#p$R$d$p$u$v$w$x$y%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g!Z!hQ!n#c#p$R$d$p$u$v$w$x$y$z%e%j%p%q&`'O'g(q(|)j*o*x+w,v0g'}TOTYZ[adnoprtxy}!P!Q!R!U!X!c!d!e!f!g!h!i!k!o!p!q!s!t!z#O#S#T#[#d#g#x#y#{#}$Q$e$g$h$j$q$}%S%Z%^%`%c%g%l%n%w%|&O&Z&_&h&j&k&u&x&|'P'W'Z'l'm'p'r's'w'|(O(S(W(](^(d(g(p(r(z(})^)e)g)k)l)p)t)z*O*Y*d*g*h*k*q*r*t*v*y*z*}+Q+U+V+Y+a+c+d+k+x+y,P,X,Y,],g,h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0l0n0r&eVOYZ[dnprxy}!P!Q!U!i!k!o!p!q!s!t#[#d#g#y#{#}$Q$h$j$}%S%Z%^%`%g%l%n%w%|&Z&_&j&k&u&x'P'W'Z'l'm'p'r's'w(O(W(^(d(g(p(r(z)^)e)g)p)t)z*O*Y*d*g*h*k*q*r*t*v*y*z*}+U+V+Y+a+d+k,P,X,Y,],g,h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0n0r%oXOYZ[dnrxy}!P!Q!U!i!k#[#d#g#y#{#}$Q$h$j$}%S%^%`%g%l%n%w%|&Z&_&j&k&u&x'P'W'Z'l'm'p'r's'w(O(W(^(d(g(p(r(z)^)e)g)p)t)z*O*Y*d*g*h*k*q*t*v*y*z*}+U+V+Y+a+d+k,P,X,Y,],g,h,i,k,l,o,s,u,w,y,z-O-d-f-m-p.f.g/V/Z0i0j0kQ#vqQ/[.kR0o0q't`OTYZ[adnoprtxy}!P!Q!R!U!X!c!d!e!f!g!h!k!o!p!q!s!t!z#O#S#T#[#d#g#x#y#{#}$Q$e$g$h$j$q$}%S%Z%^%`%c%g%l%n%w%|&O&Z&_&h&j&k&u&x&|'P'W'Z'l'p'r's'w'|(O(S(W(](^(d(g(p(r(z(})^)e)g)k)l)p)t)z*O*Y*g*h*k*q*r*t*v*y*z*}+Q+U+V+Y+a+c+d+k+x+y,P,X,Y,],h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0l0n0rh#jhz{$W$Z&l&q)S)X+f+g-RW#rq&].k0qQ$]|Q$a!OQ$n!VQ$o!WW$|!i'm*d,gS&[#s#tQ'S$iQ(s&UQ)U&nU)Y&s)Z+jW)a&w+m-T-{Q*Q']W*R'_,`-h.TQ+l)`S,_*S*TQ-Q+eQ-_,TQ-c,WQ.R-al.W-l.^._.a.z.|/R/j/o/t/y0U0Z0^Q/S.`Q/a.tQ/l/OU0P/u0S0[X0V/z0W0_0`R&Z#r!_!wYZ!P!Q!k%S%`%g'p'r's(O(W)g*g*h*k*q*t*v,h,i,k,l,o-m-p.f.g/ZR%^!vQ!{YQ%x#[Q&d#}Q&g$QR,{+YT.j-s/s!Y!jQ!n#c#p$R$d$p$u$v$w$x$y$z%e%j%p%q&`'O'g(q(|)j*o*x+w,v0gQ&X#kQ'c$oR*^'dR'l$|Q%V!mR/_.r'|_OTYZ[adnoprtxy}!P!Q!R!U!X!c!d!e!f!g!h!i!k!o!p!q!s!t!z#O#S#T#[#d#g#x#y#{#}$Q$e$g$h$j$q$}%S%Z%^%`%c%g%l%n%w%|&O&Z&_&h&j&k&u&x&|'P'W'Z'l'm'p'r's'w'|(O(S(W(](^(d(g(p(r(z(})^)e)g)k)l)p)t)z*O*Y*d*g*h*k*q*r*t*v*y*z*}+Q+U+V+Y+a+c+d+k+x+y,P,X,Y,],g,h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0l0n0rS#a_#b!P.[-l.^._.`.a.t.z.|/R/j/o/t/u/y/z0S0U0W0Z0[0^0_0`'|_OTYZ[adnoprtxy}!P!Q!R!U!X!c!d!e!f!g!h!i!k!o!p!q!s!t!z#O#S#T#[#d#g#x#y#{#}$Q$e$g$h$j$q$}%S%Z%^%`%c%g%l%n%w%|&O&Z&_&h&j&k&u&x&|'P'W'Z'l'm'p'r's'w'|(O(S(W(](^(d(g(p(r(z(})^)e)g)k)l)p)t)z*O*Y*d*g*h*k*q*r*t*v*y*z*}+Q+U+V+Y+a+c+d+k+x+y,P,X,Y,],g,h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0l0n0rT#a_#bT#^^#_R(o%xa(l%x(n(o+`,{-y-z.oT+[(k+]R-z,{Q$PsQ+l)aQ,^*RR-e,_X#}s$O$P&fQ&y$aQ'a$nQ'd$oR)s'SQ)b&wV-S+m-T-{ZgOn$j)t,PXkOn)t,PQ$k!TQ&z$bQ&{$cQ'^$mQ'b$oQ)q'RQ)x'WQ){'XQ)|'YQ*Z'`S*]'c'dQ+s)gQ+u)hQ+v)iQ+z)oS+|)r*[Q,Q)vQ,R)wS,S)y)zQ,d*^Q-V+rQ-W+tQ-Y+{S-Z+},OQ-`,UQ-b,VQ-|-XQ.O-[Q.P-^Q.Q-_Q.p-}Q.q.RQ/W.dR/r/XWkOn)t,PR#mjQ'`$nS)r'S'aR,O)sQ,]*RR-f,^Q*['`Q+})rR-[,OZiOjn)t,PQ'f$pR*`'gT-j,e-ku.c-l.^._.a.t.z.|/R/j/o/t/u/y0S0U0Z0[0^t.c-l.^._.a.t.z.|/R/j/o/t/u/y0S0U0Z0[0^Q/S.`X0V/z0W0_0`!P.Z-l.^._.`.a.t.z.|/R/j/o/t/u/y/z0S0U0W0Z0[0^0_0`Q.w.YR/f.xg.z.].{/b/i/n/|0O0Q0]0a0bu.b-l.^._.a.t.z.|/R/j/o/t/u/y0S0U0Z0[0^X.u.W.b/a0PR/c.tV0R/u0S0[R/X.dQnOS#on,PR,P)tQ&^#uR(x&^S%m#R#wS(_%m(bT(b%p&`Q%a!yQ%h!}W(P%a%h(U(YQ(U%eR(Y%jQ&i$RR)O&iQ(e%qQ*{(`T+R(e*{Q'n%OR*e'nS'q%R%SY*i'q*j,m-q.hU*j'r's'tU,m*k*l*mS-q,n,oR.h-rQ#Y]R%t#YQ#_^R%y#_Q(h%vS+W(h+XR+X(iQ+](kR,|+]Q#b_R%{#bQ#ebQ%}#cW&Q#e%}({+bQ({&cR+b0gQ$OsS&e$O&fR&f$PQ&v$_R)_&vQ&V#jR(t&VQ&m$VS)T&m+hR+h)UQ$Z{R&p$ZQ&t$]R)[&tQ+n)bR-U+nQ#hfR&S#hQ)f&zR+q)fQ&}$dS)m&})nR)n'OQ'V$kR)u'VQ'[$lS*P'[,ZR,Z*QQ,a*VR-i,aWjOn)t,PR#ljQ-k,eR.U-kd.{.]/b/i/n/|0O0Q0]0a0bR/h.{U.s.W/a0PR/`.sQ/{/nS0X/{0YR0Y/|S/v/b/cR0T/vQ.}.]R/k.}R!ZPXmOn)t,PWlOn)t,PR'T$jYfOn$j)t,PR&R#g[sOn#g$j)t,PR&d#}&dQOYZ[dnprxy}!P!Q!U!i!k!o!p!q!s!t#[#d#g#y#{#}$Q$h$j$}%S%Z%^%`%g%l%n%w%|&Z&_&j&k&u&x'P'W'Z'l'm'p'r's'w(O(W(^(d(g(p(r(z)^)e)g)p)t)z*O*Y*d*g*h*k*q*r*t*v*y*z*}+U+V+Y+a+d+k,P,X,Y,],g,h,i,k,l,o,q,s,u,w,y,z-O-d-f-m-p-s.f.g/V/Z/s0c0d0e0f0h0i0j0k0n0rQ!nTQ#caQ#poU$Rt%c(SS$d!R$gQ$p!XQ$u!cQ$v!dQ$w!eQ$x!fQ$y!gQ$z!hQ%e!zQ%j#OQ%p#SQ%q#TQ&`#xQ'O$eQ'g$qQ(q&OU(|&h(}+cW)j&|)l+x+yQ*o'|Q*x(]Q+w)kQ,v+QR0g0lQ!yYQ!}ZQ$b!PQ$c!QQ%R!kQ't%S^'{%`%g(O(W*q*t*v^*f'p*h,k,l-p.g/ZQ*l'rQ*m'sQ+t)gQ,j*gQ,n*kQ-n,hQ-o,iQ-r,oQ.e-mR/Y.f[bOn#g$j)t,P!^!vYZ!P!Q!k%S%`%g'p'r's(O(W)g*g*h*k*q*t*v,h,i,k,l,o-m-p.f.g/ZQ#R[Q#fdS#wrxQ$UyW$_}$Q'P)pS$l!U$hW${!i'm*d,gS%v#[+Y`&P#d%|(p(r(z+a-O0kQ&a#yQ&b#{Q&c#}Q'j$}Q'z%^W([%l(^*y*}Q(`%nQ(i%wQ(v&ZS(y&_0iQ)P&jQ)Q&kU)]&u)^+kQ)d&xQ)y'WY)}'Z*O,X,Y-dQ*b'lS*n'w0jW+P(d*z,s,wW+T(g+V,y,zQ+p)eQ,U)zQ,c*YQ,x+UQ-P+dQ-e,]Q-v,uQ.S-fR/q/VhUOn#d#g$j%|&_'w(p(r)t,P%U!uYZ[drxy}!P!Q!U!i!k#[#y#{#}$Q$h$}%S%^%`%g%l%n%w&Z&j&k&u&x'P'W'Z'l'm'p'r's(O(W(^(d(g(z)^)e)g)p)z*O*Y*d*g*h*k*q*t*v*y*z*}+U+V+Y+a+d+k,X,Y,],g,h,i,k,l,o,s,u,w,y,z-O-d-f-m-p.f.g/V/Z0i0j0kQ#qpW%W!o!s0d0nQ%X!pQ%Y!qQ%[!tQ%f0cS'v%Z0hQ'x0eQ'y0fQ,p*rQ-u,qS.i-s/sR0p0rU#uq.k0qR(w&][cOn#g$j)t,PZ!xY#[#}$Q+YQ#W[Q#zrR$TxQ%b!yQ%i!}Q%o#RQ'j${Q(V%eQ(Z%jQ(c%pQ(f%qQ*|(`Q,f*bQ-t,pQ.m-uR/].lQ$StQ(R%cR*s(SQ.l-sR/}/sR#QZR#V[R%Q!iQ%O!iV*c'm*d,g!Z!lQ!n#c#p$R$d$p$u$v$w$x$y$z%e%j%p%q&`'O'g(q(|)j*o*x+w,v0gR%T!kT#]^#_Q%x#[R,{+YQ(m%xS+_(n(oQ,}+`Q-x,{S.n-y-zR/^.oT+Z(k+]Q$`}Q&g$QQ)o'PR+{)pQ$XzQ)W&qR+i)XQ$XzQ&o$WQ)W&qR+i)XQ#khW$Vz$W&q)XQ$[{Q&r$ZZ)R&l)S+f+g-RR$^|R)c&wXlOn)t,PQ$f!RR'Q$gQ$m!UR'R$hR*X'_Q*V'_V-g,`-h.TQ.d-lQ/P.^R/Q._U.]-l.^._Q/U.aQ/b.tQ/g.zU/i.|/j/yQ/n/RQ/|/oQ0O/tU0Q/u0S0[Q0]0UQ0a0ZR0b0^R/T.`R/d.t",
  nodeNames: "⚠ print Escape { Comment Script AssignStatement * BinaryExpression BitOp BitOp BitOp BitOp ArithOp ArithOp @ ArithOp ** UnaryExpression ArithOp BitOp AwaitExpression await ) ( ParenthesizedExpression BinaryExpression or and CompareOp in not is UnaryExpression ConditionalExpression if else LambdaExpression lambda ParamList VariableName AssignOp , : NamedExpression AssignOp YieldExpression yield from TupleExpression ComprehensionExpression async for LambdaExpression ] [ ArrayExpression ArrayComprehensionExpression } { DictionaryExpression DictionaryComprehensionExpression SetExpression SetComprehensionExpression CallExpression ArgList AssignOp MemberExpression . PropertyName Number String FormatString FormatReplacement FormatSelfDoc FormatConversion FormatSpec FormatReplacement FormatSelfDoc ContinuedString Ellipsis None Boolean TypeDef AssignOp UpdateStatement UpdateOp ExpressionStatement DeleteStatement del PassStatement pass BreakStatement break ContinueStatement continue ReturnStatement return YieldStatement PrintStatement RaiseStatement raise ImportStatement import as ScopeStatement global nonlocal AssertStatement assert TypeDefinition type TypeParamList TypeParam StatementGroup ; IfStatement Body elif WhileStatement while ForStatement TryStatement try except finally WithStatement with FunctionDefinition def ParamList AssignOp TypeDef ClassDefinition class DecoratedStatement Decorator At MatchStatement match MatchBody MatchClause case CapturePattern LiteralPattern ArithOp ArithOp AsPattern OrPattern LogicOp AttributePattern SequencePattern MappingPattern StarPattern ClassPattern PatternArgList KeywordPattern KeywordPattern Guard",
  maxTerm: 277,
  context: Ey,
  nodeProps: [
    ["isolate", -5, 4, 71, 72, 73, 77, ""],
    ["group", -15, 6, 85, 87, 88, 90, 92, 94, 96, 98, 99, 100, 102, 105, 108, 110, "Statement Statement", -22, 8, 18, 21, 25, 40, 49, 50, 56, 57, 60, 61, 62, 63, 64, 67, 70, 71, 72, 79, 80, 81, 82, "Expression", -10, 114, 116, 119, 121, 122, 126, 128, 133, 135, 138, "Statement", -9, 143, 144, 147, 148, 150, 151, 152, 153, 154, "Pattern"],
    ["openedBy", 23, "(", 54, "[", 58, "{"],
    ["closedBy", 24, ")", 55, "]", 59, "}"]
  ],
  propSources: [Uy],
  skippedNodes: [0, 4],
  repeatNodeCount: 34,
  tokenData: "!2|~R!`OX%TXY%oY[%T[]%o]p%Tpq%oqr'ars)Yst*xtu%Tuv,dvw-hwx.Uxy/tyz0[z{0r{|2S|}2p}!O3W!O!P4_!P!Q:Z!Q!R;k!R![>_![!]Do!]!^Es!^!_FZ!_!`Gk!`!aHX!a!b%T!b!cIf!c!dJU!d!eK^!e!hJU!h!i!#f!i!tJU!t!u!,|!u!wJU!w!x!.t!x!}JU!}#O!0S#O#P&o#P#Q!0j#Q#R!1Q#R#SJU#S#T%T#T#UJU#U#VK^#V#YJU#Y#Z!#f#Z#fJU#f#g!,|#g#iJU#i#j!.t#j#oJU#o#p!1n#p#q!1s#q#r!2a#r#s!2f#s$g%T$g;'SJU;'S;=`KW<%lOJU`%YT&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%T`%lP;=`<%l%To%v]&n`%c_OX%TXY%oY[%T[]%o]p%Tpq%oq#O%T#O#P&o#P#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%To&tX&n`OY%TYZ%oZ]%T]^%o^#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tc'f[&n`O!_%T!_!`([!`#T%T#T#U(r#U#f%T#f#g(r#g#h(r#h#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tc(cTmR&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tc(yT!mR&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk)aV&n`&[ZOr%Trs)vs#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk){V&n`Or%Trs*bs#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk*iT&n`&^ZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%To+PZS_&n`OY*xYZ%TZ]*x]^%T^#o*x#o#p+r#p#q*x#q#r+r#r;'S*x;'S;=`,^<%lO*x_+wTS_OY+rZ]+r^;'S+r;'S;=`,W<%lO+r_,ZP;=`<%l+ro,aP;=`<%l*xj,kV%rQ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tj-XT!xY&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tj-oV%lQ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk.]V&n`&ZZOw%Twx.rx#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk.wV&n`Ow%Twx/^x#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk/eT&n`&]ZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk/{ThZ&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tc0cTgR&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk0yXVZ&n`Oz%Tz{1f{!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk1mVaR&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk2ZV%oZ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tc2wTzR&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%To3_W%pZ&n`O!_%T!_!`-Q!`!a3w!a#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Td4OT&{S&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk4fX!fQ&n`O!O%T!O!P5R!P!Q%T!Q![6T![#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk5WV&n`O!O%T!O!P5m!P#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk5tT!rZ&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti6[a!hX&n`O!Q%T!Q![6T![!g%T!g!h7a!h!l%T!l!m9s!m#R%T#R#S6T#S#X%T#X#Y7a#Y#^%T#^#_9s#_#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti7fZ&n`O{%T{|8X|}%T}!O8X!O!Q%T!Q![8s![#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti8^V&n`O!Q%T!Q![8s![#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti8z]!hX&n`O!Q%T!Q![8s![!l%T!l!m9s!m#R%T#R#S8s#S#^%T#^#_9s#_#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti9zT!hX&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk:bX%qR&n`O!P%T!P!Q:}!Q!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tj;UV%sQ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti;ro!hX&n`O!O%T!O!P=s!P!Q%T!Q![>_![!d%T!d!e?q!e!g%T!g!h7a!h!l%T!l!m9s!m!q%T!q!rA]!r!z%T!z!{Bq!{#R%T#R#S>_#S#U%T#U#V?q#V#X%T#X#Y7a#Y#^%T#^#_9s#_#c%T#c#dA]#d#l%T#l#mBq#m#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti=xV&n`O!Q%T!Q![6T![#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti>fc!hX&n`O!O%T!O!P=s!P!Q%T!Q![>_![!g%T!g!h7a!h!l%T!l!m9s!m#R%T#R#S>_#S#X%T#X#Y7a#Y#^%T#^#_9s#_#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti?vY&n`O!Q%T!Q!R@f!R!S@f!S#R%T#R#S@f#S#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Ti@mY!hX&n`O!Q%T!Q!R@f!R!S@f!S#R%T#R#S@f#S#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TiAbX&n`O!Q%T!Q!YA}!Y#R%T#R#SA}#S#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TiBUX!hX&n`O!Q%T!Q!YA}!Y#R%T#R#SA}#S#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TiBv]&n`O!Q%T!Q![Co![!c%T!c!iCo!i#R%T#R#SCo#S#T%T#T#ZCo#Z#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TiCv]!hX&n`O!Q%T!Q![Co![!c%T!c!iCo!i#R%T#R#SCo#S#T%T#T#ZCo#Z#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%ToDvV{_&n`O!_%T!_!`E]!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TcEdT%{R&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TkEzT#gZ&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TkFbXmR&n`O!^%T!^!_F}!_!`([!`!a([!a#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TjGUV%mQ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TkGrV%zZ&n`O!_%T!_!`([!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TkH`WmR&n`O!_%T!_!`([!`!aHx!a#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TjIPV%nQ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TkIoV_Q#}P&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%ToJ_]&n`&YS%uZO!Q%T!Q![JU![!c%T!c!}JU!}#R%T#R#SJU#S#T%T#T#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUoKZP;=`<%lJUoKge&n`&YS%uZOr%Trs)Ysw%Twx.Ux!Q%T!Q![JU![!c%T!c!tJU!t!uLx!u!}JU!}#R%T#R#SJU#S#T%T#T#fJU#f#gLx#g#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUoMRa&n`&YS%uZOr%TrsNWsw%Twx! vx!Q%T!Q![JU![!c%T!c!}JU!}#R%T#R#SJU#S#T%T#T#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUkN_V&n`&`ZOr%TrsNts#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%TkNyV&n`Or%Trs! `s#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk! gT&n`&bZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk! }V&n`&_ZOw%Twx!!dx#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!!iV&n`Ow%Twx!#Ox#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!#VT&n`&aZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%To!#oe&n`&YS%uZOr%Trs!%Qsw%Twx!&px!Q%T!Q![JU![!c%T!c!tJU!t!u!(`!u!}JU!}#R%T#R#SJU#S#T%T#T#fJU#f#g!(`#g#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUk!%XV&n`&dZOr%Trs!%ns#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!%sV&n`Or%Trs!&Ys#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!&aT&n`&fZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!&wV&n`&cZOw%Twx!'^x#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!'cV&n`Ow%Twx!'xx#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!(PT&n`&eZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%To!(ia&n`&YS%uZOr%Trs!)nsw%Twx!+^x!Q%T!Q![JU![!c%T!c!}JU!}#R%T#R#SJU#S#T%T#T#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUk!)uV&n`&hZOr%Trs!*[s#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!*aV&n`Or%Trs!*vs#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!*}T&n`&jZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!+eV&n`&gZOw%Twx!+zx#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!,PV&n`Ow%Twx!,fx#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tk!,mT&n`&iZO#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%To!-Vi&n`&YS%uZOr%TrsNWsw%Twx! vx!Q%T!Q![JU![!c%T!c!dJU!d!eLx!e!hJU!h!i!(`!i!}JU!}#R%T#R#SJU#S#T%T#T#UJU#U#VLx#V#YJU#Y#Z!(`#Z#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUo!.}a&n`&YS%uZOr%Trs)Ysw%Twx.Ux!Q%T!Q![JU![!c%T!c!}JU!}#R%T#R#SJU#S#T%T#T#oJU#p#q%T#r$g%T$g;'SJU;'S;=`KW<%lOJUk!0ZT!XZ&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tc!0qT!WR&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%Tj!1XV%kQ&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%T~!1sO!]~k!1zV%jR&n`O!_%T!_!`-Q!`#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%T~!2fO![~i!2mT%tX&n`O#o%T#p#q%T#r;'S%T;'S;=`%i<%lO%T",
  tokenizers: [Ly, zy, Wy, Yy, 0, 1, 2, 3, 4],
  topRules: { Script: [0, 5] },
  specialized: [{ term: 221, get: (n) => Dy[n] || -1 }],
  tokenPrec: 7668
}), gO = /* @__PURE__ */ new jl(), Qd = /* @__PURE__ */ new Set([
  "Script",
  "Body",
  "FunctionDefinition",
  "ClassDefinition",
  "LambdaExpression",
  "ForStatement",
  "MatchClause"
]);
function or(n) {
  return (e, t, i) => {
    if (i)
      return !1;
    let r = e.node.getChild("VariableName");
    return r && t(r, n), !0;
  };
}
const Iy = {
  FunctionDefinition: /* @__PURE__ */ or("function"),
  ClassDefinition: /* @__PURE__ */ or("class"),
  ForStatement(n, e, t) {
    if (t) {
      for (let i = n.node.firstChild; i; i = i.nextSibling)
        if (i.name == "VariableName")
          e(i, "variable");
        else if (i.name == "in")
          break;
    }
  },
  ImportStatement(n, e) {
    var t, i;
    let { node: r } = n, s = ((t = r.firstChild) === null || t === void 0 ? void 0 : t.name) == "from";
    for (let o = r.getChild("import"); o; o = o.nextSibling)
      o.name == "VariableName" && ((i = o.nextSibling) === null || i === void 0 ? void 0 : i.name) != "as" && e(o, s ? "variable" : "namespace");
  },
  AssignStatement(n, e) {
    for (let t = n.node.firstChild; t; t = t.nextSibling)
      if (t.name == "VariableName")
        e(t, "variable");
      else if (t.name == ":" || t.name == "AssignOp")
        break;
  },
  ParamList(n, e) {
    for (let t = null, i = n.node.firstChild; i; i = i.nextSibling)
      i.name == "VariableName" && (!t || !/\*|AssignOp/.test(t.name)) && e(i, "variable"), t = i;
  },
  CapturePattern: /* @__PURE__ */ or("variable"),
  AsPattern: /* @__PURE__ */ or("variable"),
  __proto__: null
};
function Sd(n, e) {
  let t = gO.get(e);
  if (t)
    return t;
  let i = [], r = !0;
  function s(o, l) {
    let a = n.sliceString(o.from, o.to);
    i.push({ label: a, type: l });
  }
  return e.cursor(V.IncludeAnonymous).iterate((o) => {
    if (o.name) {
      let l = Iy[o.name];
      if (l && l(o, s, r) || !r && Qd.has(o.name))
        return !1;
      r = !1;
    } else if (o.to - o.from > 8192) {
      for (let l of Sd(n, o.node))
        i.push(l);
      return !1;
    }
  }), gO.set(e, i), i;
}
const QO = /^[\w\xa1-\uffff][\w\d\xa1-\uffff]*$/, bd = ["String", "FormatString", "Comment", "PropertyName"];
function Gy(n) {
  let e = I(n.state).resolveInner(n.pos, -1);
  if (bd.indexOf(e.name) > -1)
    return null;
  let t = e.name == "VariableName" || e.to - e.from < 20 && QO.test(n.state.sliceDoc(e.from, e.to));
  if (!t && !n.explicit)
    return null;
  let i = [];
  for (let r = e; r; r = r.parent)
    Qd.has(r.name) && (i = i.concat(Sd(n.state.doc, r)));
  return {
    options: i,
    from: t ? e.from : n.pos,
    validFor: QO
  };
}
const Ny = /* @__PURE__ */ [
  "__annotations__",
  "__builtins__",
  "__debug__",
  "__doc__",
  "__import__",
  "__name__",
  "__loader__",
  "__package__",
  "__spec__",
  "False",
  "None",
  "True"
].map((n) => ({ label: n, type: "constant" })).concat(/* @__PURE__ */ [
  "ArithmeticError",
  "AssertionError",
  "AttributeError",
  "BaseException",
  "BlockingIOError",
  "BrokenPipeError",
  "BufferError",
  "BytesWarning",
  "ChildProcessError",
  "ConnectionAbortedError",
  "ConnectionError",
  "ConnectionRefusedError",
  "ConnectionResetError",
  "DeprecationWarning",
  "EOFError",
  "Ellipsis",
  "EncodingWarning",
  "EnvironmentError",
  "Exception",
  "FileExistsError",
  "FileNotFoundError",
  "FloatingPointError",
  "FutureWarning",
  "GeneratorExit",
  "IOError",
  "ImportError",
  "ImportWarning",
  "IndentationError",
  "IndexError",
  "InterruptedError",
  "IsADirectoryError",
  "KeyError",
  "KeyboardInterrupt",
  "LookupError",
  "MemoryError",
  "ModuleNotFoundError",
  "NameError",
  "NotADirectoryError",
  "NotImplemented",
  "NotImplementedError",
  "OSError",
  "OverflowError",
  "PendingDeprecationWarning",
  "PermissionError",
  "ProcessLookupError",
  "RecursionError",
  "ReferenceError",
  "ResourceWarning",
  "RuntimeError",
  "RuntimeWarning",
  "StopAsyncIteration",
  "StopIteration",
  "SyntaxError",
  "SyntaxWarning",
  "SystemError",
  "SystemExit",
  "TabError",
  "TimeoutError",
  "TypeError",
  "UnboundLocalError",
  "UnicodeDecodeError",
  "UnicodeEncodeError",
  "UnicodeError",
  "UnicodeTranslateError",
  "UnicodeWarning",
  "UserWarning",
  "ValueError",
  "Warning",
  "ZeroDivisionError"
].map((n) => ({ label: n, type: "type" }))).concat(/* @__PURE__ */ [
  "bool",
  "bytearray",
  "bytes",
  "classmethod",
  "complex",
  "float",
  "frozenset",
  "int",
  "list",
  "map",
  "memoryview",
  "object",
  "range",
  "set",
  "staticmethod",
  "str",
  "super",
  "tuple",
  "type"
].map((n) => ({ label: n, type: "class" }))).concat(/* @__PURE__ */ [
  "abs",
  "aiter",
  "all",
  "anext",
  "any",
  "ascii",
  "bin",
  "breakpoint",
  "callable",
  "chr",
  "compile",
  "delattr",
  "dict",
  "dir",
  "divmod",
  "enumerate",
  "eval",
  "exec",
  "exit",
  "filter",
  "format",
  "getattr",
  "globals",
  "hasattr",
  "hash",
  "help",
  "hex",
  "id",
  "input",
  "isinstance",
  "issubclass",
  "iter",
  "len",
  "license",
  "locals",
  "max",
  "min",
  "next",
  "oct",
  "open",
  "ord",
  "pow",
  "print",
  "property",
  "quit",
  "repr",
  "reversed",
  "round",
  "setattr",
  "slice",
  "sorted",
  "sum",
  "vars",
  "zip"
].map((n) => ({ label: n, type: "function" }))), Fy = [
  /* @__PURE__ */ ee("def ${name}(${params}):\n	${}", {
    label: "def",
    detail: "function",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("for ${name} in ${collection}:\n	${}", {
    label: "for",
    detail: "loop",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("while ${}:\n	${}", {
    label: "while",
    detail: "loop",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("try:\n	${}\nexcept ${error}:\n	${}", {
    label: "try",
    detail: "/ except block",
    type: "keyword"
  }),
  /* @__PURE__ */ ee(`if \${}:
	
`, {
    label: "if",
    detail: "block",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("if ${}:\n	${}\nelse:\n	${}", {
    label: "if",
    detail: "/ else block",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("class ${name}:\n	def __init__(self, ${params}):\n			${}", {
    label: "class",
    detail: "definition",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("import ${module}", {
    label: "import",
    detail: "statement",
    type: "keyword"
  }),
  /* @__PURE__ */ ee("from ${module} import ${names}", {
    label: "from",
    detail: "import",
    type: "keyword"
  })
], Hy = /* @__PURE__ */ Uu(bd, /* @__PURE__ */ Gl(/* @__PURE__ */ Ny.concat(Fy)));
function Ks(n) {
  let { node: e, pos: t } = n, i = n.lineIndent(t, -1), r = null;
  for (; ; ) {
    let s = e.childBefore(t);
    if (s)
      if (s.name == "Comment")
        t = s.from;
      else if (s.name == "Body" || s.name == "MatchBody")
        n.baseIndentFor(s) + n.unit <= i && (r = s), e = s;
      else if (s.name == "MatchClause")
        e = s;
      else if (s.type.is("Statement"))
        e = s;
      else
        break;
    else break;
  }
  return r;
}
function Js(n, e) {
  let t = n.baseIndentFor(e), i = n.lineAt(n.pos, -1), r = i.from + i.text.length;
  return /^\s*($|#)/.test(i.text) && n.node.to < r + 100 && !/\S/.test(n.state.sliceDoc(r, n.node.to)) && n.lineIndent(n.pos, -1) <= t || /^\s*(else:|elif |except |finally:|case\s+[^=:]+:)/.test(n.textAfter) && n.lineIndent(n.pos, -1) > t ? null : t + n.unit;
}
const eo = /* @__PURE__ */ Et.define({
  name: "python",
  parser: /* @__PURE__ */ By.configure({
    props: [
      /* @__PURE__ */ Bt.add({
        Body: (n) => {
          var e;
          let t = /^\s*(#|$)/.test(n.textAfter) && Ks(n) || n.node;
          return (e = Js(n, t)) !== null && e !== void 0 ? e : n.continue();
        },
        MatchBody: (n) => {
          var e;
          let t = Ks(n);
          return (e = Js(n, t || n.node)) !== null && e !== void 0 ? e : n.continue();
        },
        IfStatement: (n) => /^\s*(else:|elif )/.test(n.textAfter) ? n.baseIndent : n.continue(),
        "ForStatement WhileStatement": (n) => /^\s*else:/.test(n.textAfter) ? n.baseIndent : n.continue(),
        TryStatement: (n) => /^\s*(except[ :]|finally:|else:)/.test(n.textAfter) ? n.baseIndent : n.continue(),
        MatchStatement: (n) => /^\s*case /.test(n.textAfter) ? n.baseIndent + n.unit : n.continue(),
        "TupleExpression ComprehensionExpression ParamList ArgList ParenthesizedExpression": /* @__PURE__ */ mr({ closing: ")" }),
        "DictionaryExpression DictionaryComprehensionExpression SetExpression SetComprehensionExpression": /* @__PURE__ */ mr({ closing: "}" }),
        "ArrayExpression ArrayComprehensionExpression": /* @__PURE__ */ mr({ closing: "]" }),
        MemberExpression: (n) => n.baseIndent + n.unit,
        "String FormatString": () => null,
        Script: (n) => {
          var e;
          let t = Ks(n);
          return (e = t && Js(n, t)) !== null && e !== void 0 ? e : n.continue();
        }
      }),
      /* @__PURE__ */ It.add({
        "ArrayExpression DictionaryExpression SetExpression TupleExpression": cs,
        Body: (n, e) => ({ from: n.from + 1, to: n.to - (n.to == e.doc.length ? 0 : 1) }),
        "String FormatString": (n, e) => ({ from: e.doc.lineAt(n.from).to, to: n.to })
      })
    ]
  }),
  languageData: {
    closeBrackets: {
      brackets: ["(", "[", "{", "'", '"', "'''", '"""'],
      stringPrefixes: [
        "f",
        "fr",
        "rf",
        "r",
        "u",
        "b",
        "br",
        "rb",
        "F",
        "FR",
        "RF",
        "R",
        "U",
        "B",
        "BR",
        "RB"
      ]
    },
    commentTokens: { line: "#" },
    // Indent logic logic are triggered upon below input patterns
    indentOnInput: /^\s*([\}\]\)]|else:|elif |except |finally:|case\s+[^:]*:?)$/
  }
});
function Bx() {
  return new ai(eo, [
    eo.data.of({ autocomplete: Gy }),
    eo.data.of({ autocomplete: Hy })
  ]);
}
const Ky = 55, Jy = 1, ek = 56, tk = 2, ik = 57, nk = 3, SO = 4, rk = 5, oa = 6, yd = 7, kd = 8, $d = 9, xd = 10, sk = 11, ok = 12, lk = 13, to = 58, ak = 14, hk = 15, bO = 59, Pd = 21, Ok = 23, wd = 24, ck = 25, al = 27, vd = 28, fk = 29, uk = 32, dk = 35, pk = 37, mk = 38, gk = 0, Qk = 1, Sk = {
  area: !0,
  base: !0,
  br: !0,
  col: !0,
  command: !0,
  embed: !0,
  frame: !0,
  hr: !0,
  img: !0,
  input: !0,
  keygen: !0,
  link: !0,
  meta: !0,
  param: !0,
  source: !0,
  track: !0,
  wbr: !0,
  menuitem: !0
}, bk = {
  dd: !0,
  li: !0,
  optgroup: !0,
  option: !0,
  p: !0,
  rp: !0,
  rt: !0,
  tbody: !0,
  td: !0,
  tfoot: !0,
  th: !0,
  tr: !0
}, yO = {
  dd: { dd: !0, dt: !0 },
  dt: { dd: !0, dt: !0 },
  li: { li: !0 },
  option: { option: !0, optgroup: !0 },
  optgroup: { optgroup: !0 },
  p: {
    address: !0,
    article: !0,
    aside: !0,
    blockquote: !0,
    dir: !0,
    div: !0,
    dl: !0,
    fieldset: !0,
    footer: !0,
    form: !0,
    h1: !0,
    h2: !0,
    h3: !0,
    h4: !0,
    h5: !0,
    h6: !0,
    header: !0,
    hgroup: !0,
    hr: !0,
    menu: !0,
    nav: !0,
    ol: !0,
    p: !0,
    pre: !0,
    section: !0,
    table: !0,
    ul: !0
  },
  rp: { rp: !0, rt: !0 },
  rt: { rp: !0, rt: !0 },
  tbody: { tbody: !0, tfoot: !0 },
  td: { td: !0, th: !0 },
  tfoot: { tbody: !0 },
  th: { td: !0, th: !0 },
  thead: { tbody: !0, tfoot: !0 },
  tr: { tr: !0 }
};
function yk(n) {
  return n == 45 || n == 46 || n == 58 || n >= 65 && n <= 90 || n == 95 || n >= 97 && n <= 122 || n >= 161;
}
let kO = null, $O = null, xO = 0;
function hl(n, e) {
  let t = n.pos + e;
  if (xO == t && $O == n) return kO;
  let i = n.peek(e), r = "";
  for (; yk(i); )
    r += String.fromCharCode(i), i = n.peek(++e);
  return $O = n, xO = t, kO = r ? r.toLowerCase() : i == kk || i == $k ? void 0 : null;
}
const Td = 60, Fr = 62, la = 47, kk = 63, $k = 33, xk = 45;
function PO(n, e) {
  this.name = n, this.parent = e;
}
const Pk = [oa, xd, yd, kd, $d], wk = new na({
  start: null,
  shift(n, e, t, i) {
    return Pk.indexOf(e) > -1 ? new PO(hl(i, 1) || "", n) : n;
  },
  reduce(n, e) {
    return e == Pd && n ? n.parent : n;
  },
  reuse(n, e, t, i) {
    let r = e.type.id;
    return r == oa || r == pk ? new PO(hl(i, 1) || "", n) : n;
  },
  strict: !1
}), vk = new de((n, e) => {
  if (n.next != Td) {
    n.next < 0 && e.context && n.acceptToken(to);
    return;
  }
  n.advance();
  let t = n.next == la;
  t && n.advance();
  let i = hl(n, 0);
  if (i === void 0) return;
  if (!i) return n.acceptToken(t ? hk : ak);
  let r = e.context ? e.context.name : null;
  if (t) {
    if (i == r) return n.acceptToken(sk);
    if (r && bk[r]) return n.acceptToken(to, -2);
    if (e.dialectEnabled(gk)) return n.acceptToken(ok);
    for (let s = e.context; s; s = s.parent) if (s.name == i) return;
    n.acceptToken(lk);
  } else {
    if (i == "script") return n.acceptToken(yd);
    if (i == "style") return n.acceptToken(kd);
    if (i == "textarea") return n.acceptToken($d);
    if (Sk.hasOwnProperty(i)) return n.acceptToken(xd);
    r && yO[r] && yO[r][i] ? n.acceptToken(to, -1) : n.acceptToken(oa);
  }
}, { contextual: !0 }), Tk = new de((n) => {
  for (let e = 0, t = 0; ; t++) {
    if (n.next < 0) {
      t && n.acceptToken(bO);
      break;
    }
    if (n.next == xk)
      e++;
    else if (n.next == Fr && e >= 2) {
      t >= 3 && n.acceptToken(bO, -2);
      break;
    } else
      e = 0;
    n.advance();
  }
});
function Xk(n) {
  for (; n; n = n.parent)
    if (n.name == "svg" || n.name == "math") return !0;
  return !1;
}
const Ck = new de((n, e) => {
  if (n.next == la && n.peek(1) == Fr) {
    let t = e.dialectEnabled(Qk) || Xk(e.context);
    n.acceptToken(t ? rk : SO, 2);
  } else n.next == Fr && n.acceptToken(SO, 1);
});
function aa(n, e, t) {
  let i = 2 + n.length;
  return new de((r) => {
    for (let s = 0, o = 0, l = 0; ; l++) {
      if (r.next < 0) {
        l && r.acceptToken(e);
        break;
      }
      if (s == 0 && r.next == Td || s == 1 && r.next == la || s >= 2 && s < i && r.next == n.charCodeAt(s - 2))
        s++, o++;
      else if (s == i && r.next == Fr) {
        l > o ? r.acceptToken(e, -o) : r.acceptToken(t, -(o - 2));
        break;
      } else if ((r.next == 10 || r.next == 13) && l) {
        r.acceptToken(e, 1);
        break;
      } else
        s = o = 0;
      r.advance();
    }
  });
}
const Zk = aa("script", Ky, Jy), Rk = aa("style", ek, tk), Ak = aa("textarea", ik, nk), qk = Dt({
  "Text RawText IncompleteTag IncompleteCloseTag": m.content,
  "StartTag StartCloseTag SelfClosingEndTag EndTag": m.angleBracket,
  TagName: m.tagName,
  "MismatchedCloseTag/TagName": [m.tagName, m.invalid],
  AttributeName: m.attributeName,
  "AttributeValue UnquotedAttributeValue": m.attributeValue,
  Is: m.definitionOperator,
  "EntityReference CharacterReference": m.character,
  Comment: m.blockComment,
  ProcessingInst: m.processingInstruction,
  DoctypeDecl: m.documentMeta
}), jk = Yt.deserialize({
  version: 14,
  states: ",xOVO!rOOO!ZQ#tO'#CrO!`Q#tO'#C{O!eQ#tO'#DOO!jQ#tO'#DRO!oQ#tO'#DTO!tOaO'#CqO#PObO'#CqO#[OdO'#CqO$kO!rO'#CqOOO`'#Cq'#CqO$rO$fO'#DUO$zQ#tO'#DWO%PQ#tO'#DXOOO`'#Dl'#DlOOO`'#DZ'#DZQVO!rOOO%UQ&rO,59^O%aQ&rO,59gO%lQ&rO,59jO%wQ&rO,59mO&SQ&rO,59oOOOa'#D_'#D_O&_OaO'#CyO&jOaO,59]OOOb'#D`'#D`O&rObO'#C|O&}ObO,59]OOOd'#Da'#DaO'VOdO'#DPO'bOdO,59]OOO`'#Db'#DbO'jO!rO,59]O'qQ#tO'#DSOOO`,59],59]OOOp'#Dc'#DcO'vO$fO,59pOOO`,59p,59pO(OQ#|O,59rO(TQ#|O,59sOOO`-E7X-E7XO(YQ&rO'#CtOOQW'#D['#D[O(hQ&rO1G.xOOOa1G.x1G.xOOO`1G/Z1G/ZO(sQ&rO1G/ROOOb1G/R1G/RO)OQ&rO1G/UOOOd1G/U1G/UO)ZQ&rO1G/XOOO`1G/X1G/XO)fQ&rO1G/ZOOOa-E7]-E7]O)qQ#tO'#CzOOO`1G.w1G.wOOOb-E7^-E7^O)vQ#tO'#C}OOOd-E7_-E7_O){Q#tO'#DQOOO`-E7`-E7`O*QQ#|O,59nOOOp-E7a-E7aOOO`1G/[1G/[OOO`1G/^1G/^OOO`1G/_1G/_O*VQ,UO,59`OOQW-E7Y-E7YOOOa7+$d7+$dOOO`7+$u7+$uOOOb7+$m7+$mOOOd7+$p7+$pOOO`7+$s7+$sO*bQ#|O,59fO*gQ#|O,59iO*lQ#|O,59lOOO`1G/Y1G/YO*qO7[O'#CwO+SOMhO'#CwOOQW1G.z1G.zOOO`1G/Q1G/QOOO`1G/T1G/TOOO`1G/W1G/WOOOO'#D]'#D]O+eO7[O,59cOOQW,59c,59cOOOO'#D^'#D^O+vOMhO,59cOOOO-E7Z-E7ZOOQW1G.}1G.}OOOO-E7[-E7[",
  stateData: ",c~O!_OS~OUSOVPOWQOXROYTO[]O][O^^O_^Oa^Ob^Oc^Od^Oy^O|_O!eZO~OgaO~OgbO~OgcO~OgdO~OgeO~O!XfOPmP![mP~O!YiOQpP![pP~O!ZlORsP![sP~OUSOVPOWQOXROYTOZqO[]O][O^^O_^Oa^Ob^Oc^Od^Oy^O!eZO~O![rO~P#gO!]sO!fuO~OgvO~OgwO~OS|OT}OiyO~OS!POT}OiyO~OS!ROT}OiyO~OS!TOT}OiyO~OS}OT}OiyO~O!XfOPmX![mX~OP!WO![!XO~O!YiOQpX![pX~OQ!ZO![!XO~O!ZlORsX![sX~OR!]O![!XO~O![!XO~P#gOg!_O~O!]sO!f!aO~OS!bO~OS!cO~Oj!dOShXThXihX~OS!fOT!gOiyO~OS!hOT!gOiyO~OS!iOT!gOiyO~OS!jOT!gOiyO~OS!gOT!gOiyO~Og!kO~Og!lO~Og!mO~OS!nO~Ol!qO!a!oO!c!pO~OS!rO~OS!sO~OS!tO~Ob!uOc!uOd!uO!a!wO!b!uO~Ob!xOc!xOd!xO!c!wO!d!xO~Ob!uOc!uOd!uO!a!{O!b!uO~Ob!xOc!xOd!xO!c!{O!d!xO~OT~cbd!ey|!e~",
  goto: "%q!aPPPPPPPPPPPPPPPPPPPPP!b!hP!nPP!zP!}#Q#T#Z#^#a#g#j#m#s#y!bP!b!bP$P$V$m$s$y%P%V%]%cPPPPPPPP%iX^OX`pXUOX`pezabcde{!O!Q!S!UR!q!dRhUR!XhXVOX`pRkVR!XkXWOX`pRnWR!XnXXOX`pQrXR!XpXYOX`pQ`ORx`Q{aQ!ObQ!QcQ!SdQ!UeZ!e{!O!Q!S!UQ!v!oR!z!vQ!y!pR!|!yQgUR!VgQjVR!YjQmWR![mQpXR!^pQtZR!`tS_O`ToXp",
  nodeNames: "⚠ StartCloseTag StartCloseTag StartCloseTag EndTag SelfClosingEndTag StartTag StartTag StartTag StartTag StartTag StartCloseTag StartCloseTag StartCloseTag IncompleteTag IncompleteCloseTag Document Text EntityReference CharacterReference InvalidEntity Element OpenTag TagName Attribute AttributeName Is AttributeValue UnquotedAttributeValue ScriptText CloseTag OpenTag StyleText CloseTag OpenTag TextareaText CloseTag OpenTag CloseTag SelfClosingTag Comment ProcessingInst MismatchedCloseTag CloseTag DoctypeDecl",
  maxTerm: 68,
  context: wk,
  nodeProps: [
    ["closedBy", -10, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, "EndTag", 6, "EndTag SelfClosingEndTag", -4, 22, 31, 34, 37, "CloseTag"],
    ["openedBy", 4, "StartTag StartCloseTag", 5, "StartTag", -4, 30, 33, 36, 38, "OpenTag"],
    ["group", -10, 14, 15, 18, 19, 20, 21, 40, 41, 42, 43, "Entity", 17, "Entity TextContent", -3, 29, 32, 35, "TextContent Entity"],
    ["isolate", -11, 22, 30, 31, 33, 34, 36, 37, 38, 39, 42, 43, "ltr", -3, 27, 28, 40, ""]
  ],
  propSources: [qk],
  skippedNodes: [0],
  repeatNodeCount: 9,
  tokenData: "!<p!aR!YOX$qXY,QYZ,QZ[$q[]&X]^,Q^p$qpq,Qqr-_rs3_sv-_vw3}wxHYx}-_}!OH{!O!P-_!P!Q$q!Q![-_![!]Mz!]!^-_!^!_!$S!_!`!;x!`!a&X!a!c-_!c!}Mz!}#R-_#R#SMz#S#T1k#T#oMz#o#s-_#s$f$q$f%W-_%W%oMz%o%p-_%p&aMz&a&b-_&b1pMz1p4U-_4U4dMz4d4e-_4e$ISMz$IS$I`-_$I`$IbMz$Ib$Kh-_$Kh%#tMz%#t&/x-_&/x&EtMz&Et&FV-_&FV;'SMz;'S;:j!#|;:j;=`3X<%l?&r-_?&r?AhMz?Ah?BY$q?BY?MnMz?MnO$q!Z$|caPlW!b`!dpOX$qXZ&XZ[$q[^&X^p$qpq&Xqr$qrs&}sv$qvw+Pwx(tx!^$q!^!_*V!_!a&X!a#S$q#S#T&X#T;'S$q;'S;=`+z<%lO$q!R&bXaP!b`!dpOr&Xrs&}sv&Xwx(tx!^&X!^!_*V!_;'S&X;'S;=`*y<%lO&Xq'UVaP!dpOv&}wx'kx!^&}!^!_(V!_;'S&};'S;=`(n<%lO&}P'pTaPOv'kw!^'k!_;'S'k;'S;=`(P<%lO'kP(SP;=`<%l'kp([S!dpOv(Vx;'S(V;'S;=`(h<%lO(Vp(kP;=`<%l(Vq(qP;=`<%l&}a({WaP!b`Or(trs'ksv(tw!^(t!^!_)e!_;'S(t;'S;=`*P<%lO(t`)jT!b`Or)esv)ew;'S)e;'S;=`)y<%lO)e`)|P;=`<%l)ea*SP;=`<%l(t!Q*^V!b`!dpOr*Vrs(Vsv*Vwx)ex;'S*V;'S;=`*s<%lO*V!Q*vP;=`<%l*V!R*|P;=`<%l&XW+UYlWOX+PZ[+P^p+Pqr+Psw+Px!^+P!a#S+P#T;'S+P;'S;=`+t<%lO+PW+wP;=`<%l+P!Z+}P;=`<%l$q!a,]`aP!b`!dp!_^OX&XXY,QYZ,QZ]&X]^,Q^p&Xpq,Qqr&Xrs&}sv&Xwx(tx!^&X!^!_*V!_;'S&X;'S;=`*y<%lO&X!_-ljiSaPlW!b`!dpOX$qXZ&XZ[$q[^&X^p$qpq&Xqr-_rs&}sv-_vw/^wx(tx!P-_!P!Q$q!Q!^-_!^!_*V!_!a&X!a#S-_#S#T1k#T#s-_#s$f$q$f;'S-_;'S;=`3X<%l?Ah-_?Ah?BY$q?BY?Mn-_?MnO$q[/ebiSlWOX+PZ[+P^p+Pqr/^sw/^x!P/^!P!Q+P!Q!^/^!a#S/^#S#T0m#T#s/^#s$f+P$f;'S/^;'S;=`1e<%l?Ah/^?Ah?BY+P?BY?Mn/^?MnO+PS0rXiSqr0msw0mx!P0m!Q!^0m!a#s0m$f;'S0m;'S;=`1_<%l?Ah0m?BY?Mn0mS1bP;=`<%l0m[1hP;=`<%l/^!V1vciSaP!b`!dpOq&Xqr1krs&}sv1kvw0mwx(tx!P1k!P!Q&X!Q!^1k!^!_*V!_!a&X!a#s1k#s$f&X$f;'S1k;'S;=`3R<%l?Ah1k?Ah?BY&X?BY?Mn1k?MnO&X!V3UP;=`<%l1k!_3[P;=`<%l-_!Z3hV!ahaP!dpOv&}wx'kx!^&}!^!_(V!_;'S&};'S;=`(n<%lO&}!_4WiiSlWd!ROX5uXZ7SZ[5u[^7S^p5uqr8trs7Sst>]tw8twx7Sx!P8t!P!Q5u!Q!]8t!]!^/^!^!a7S!a#S8t#S#T;{#T#s8t#s$f5u$f;'S8t;'S;=`>V<%l?Ah8t?Ah?BY5u?BY?Mn8t?MnO5u!Z5zblWOX5uXZ7SZ[5u[^7S^p5uqr5urs7Sst+Ptw5uwx7Sx!]5u!]!^7w!^!a7S!a#S5u#S#T7S#T;'S5u;'S;=`8n<%lO5u!R7VVOp7Sqs7St!]7S!]!^7l!^;'S7S;'S;=`7q<%lO7S!R7qOb!R!R7tP;=`<%l7S!Z8OYlWb!ROX+PZ[+P^p+Pqr+Psw+Px!^+P!a#S+P#T;'S+P;'S;=`+t<%lO+P!Z8qP;=`<%l5u!_8{iiSlWOX5uXZ7SZ[5u[^7S^p5uqr8trs7Sst/^tw8twx7Sx!P8t!P!Q5u!Q!]8t!]!^:j!^!a7S!a#S8t#S#T;{#T#s8t#s$f5u$f;'S8t;'S;=`>V<%l?Ah8t?Ah?BY5u?BY?Mn8t?MnO5u!_:sbiSlWb!ROX+PZ[+P^p+Pqr/^sw/^x!P/^!P!Q+P!Q!^/^!a#S/^#S#T0m#T#s/^#s$f+P$f;'S/^;'S;=`1e<%l?Ah/^?Ah?BY+P?BY?Mn/^?MnO+P!V<QciSOp7Sqr;{rs7Sst0mtw;{wx7Sx!P;{!P!Q7S!Q!];{!]!^=]!^!a7S!a#s;{#s$f7S$f;'S;{;'S;=`>P<%l?Ah;{?Ah?BY7S?BY?Mn;{?MnO7S!V=dXiSb!Rqr0msw0mx!P0m!Q!^0m!a#s0m$f;'S0m;'S;=`1_<%l?Ah0m?BY?Mn0m!V>SP;=`<%l;{!_>YP;=`<%l8t!_>dhiSlWOX@OXZAYZ[@O[^AY^p@OqrBwrsAYswBwwxAYx!PBw!P!Q@O!Q!]Bw!]!^/^!^!aAY!a#SBw#S#TE{#T#sBw#s$f@O$f;'SBw;'S;=`HS<%l?AhBw?Ah?BY@O?BY?MnBw?MnO@O!Z@TalWOX@OXZAYZ[@O[^AY^p@Oqr@OrsAYsw@OwxAYx!]@O!]!^Az!^!aAY!a#S@O#S#TAY#T;'S@O;'S;=`Bq<%lO@O!RA]UOpAYq!]AY!]!^Ao!^;'SAY;'S;=`At<%lOAY!RAtOc!R!RAwP;=`<%lAY!ZBRYlWc!ROX+PZ[+P^p+Pqr+Psw+Px!^+P!a#S+P#T;'S+P;'S;=`+t<%lO+P!ZBtP;=`<%l@O!_COhiSlWOX@OXZAYZ[@O[^AY^p@OqrBwrsAYswBwwxAYx!PBw!P!Q@O!Q!]Bw!]!^Dj!^!aAY!a#SBw#S#TE{#T#sBw#s$f@O$f;'SBw;'S;=`HS<%l?AhBw?Ah?BY@O?BY?MnBw?MnO@O!_DsbiSlWc!ROX+PZ[+P^p+Pqr/^sw/^x!P/^!P!Q+P!Q!^/^!a#S/^#S#T0m#T#s/^#s$f+P$f;'S/^;'S;=`1e<%l?Ah/^?Ah?BY+P?BY?Mn/^?MnO+P!VFQbiSOpAYqrE{rsAYswE{wxAYx!PE{!P!QAY!Q!]E{!]!^GY!^!aAY!a#sE{#s$fAY$f;'SE{;'S;=`G|<%l?AhE{?Ah?BYAY?BY?MnE{?MnOAY!VGaXiSc!Rqr0msw0mx!P0m!Q!^0m!a#s0m$f;'S0m;'S;=`1_<%l?Ah0m?BY?Mn0m!VHPP;=`<%lE{!_HVP;=`<%lBw!ZHcW!cxaP!b`Or(trs'ksv(tw!^(t!^!_)e!_;'S(t;'S;=`*P<%lO(t!aIYliSaPlW!b`!dpOX$qXZ&XZ[$q[^&X^p$qpq&Xqr-_rs&}sv-_vw/^wx(tx}-_}!OKQ!O!P-_!P!Q$q!Q!^-_!^!_*V!_!a&X!a#S-_#S#T1k#T#s-_#s$f$q$f;'S-_;'S;=`3X<%l?Ah-_?Ah?BY$q?BY?Mn-_?MnO$q!aK_kiSaPlW!b`!dpOX$qXZ&XZ[$q[^&X^p$qpq&Xqr-_rs&}sv-_vw/^wx(tx!P-_!P!Q$q!Q!^-_!^!_*V!_!`&X!`!aMS!a#S-_#S#T1k#T#s-_#s$f$q$f;'S-_;'S;=`3X<%l?Ah-_?Ah?BY$q?BY?Mn-_?MnO$q!TM_XaP!b`!dp!fQOr&Xrs&}sv&Xwx(tx!^&X!^!_*V!_;'S&X;'S;=`*y<%lO&X!aNZ!ZiSgQaPlW!b`!dpOX$qXZ&XZ[$q[^&X^p$qpq&Xqr-_rs&}sv-_vw/^wx(tx}-_}!OMz!O!PMz!P!Q$q!Q![Mz![!]Mz!]!^-_!^!_*V!_!a&X!a!c-_!c!}Mz!}#R-_#R#SMz#S#T1k#T#oMz#o#s-_#s$f$q$f$}-_$}%OMz%O%W-_%W%oMz%o%p-_%p&aMz&a&b-_&b1pMz1p4UMz4U4dMz4d4e-_4e$ISMz$IS$I`-_$I`$IbMz$Ib$Je-_$Je$JgMz$Jg$Kh-_$Kh%#tMz%#t&/x-_&/x&EtMz&Et&FV-_&FV;'SMz;'S;:j!#|;:j;=`3X<%l?&r-_?&r?AhMz?Ah?BY$q?BY?MnMz?MnO$q!a!$PP;=`<%lMz!R!$ZY!b`!dpOq*Vqr!$yrs(Vsv*Vwx)ex!a*V!a!b!4t!b;'S*V;'S;=`*s<%lO*V!R!%Q]!b`!dpOr*Vrs(Vsv*Vwx)ex}*V}!O!%y!O!f*V!f!g!']!g#W*V#W#X!0`#X;'S*V;'S;=`*s<%lO*V!R!&QX!b`!dpOr*Vrs(Vsv*Vwx)ex}*V}!O!&m!O;'S*V;'S;=`*s<%lO*V!R!&vV!b`!dp!ePOr*Vrs(Vsv*Vwx)ex;'S*V;'S;=`*s<%lO*V!R!'dX!b`!dpOr*Vrs(Vsv*Vwx)ex!q*V!q!r!(P!r;'S*V;'S;=`*s<%lO*V!R!(WX!b`!dpOr*Vrs(Vsv*Vwx)ex!e*V!e!f!(s!f;'S*V;'S;=`*s<%lO*V!R!(zX!b`!dpOr*Vrs(Vsv*Vwx)ex!v*V!v!w!)g!w;'S*V;'S;=`*s<%lO*V!R!)nX!b`!dpOr*Vrs(Vsv*Vwx)ex!{*V!{!|!*Z!|;'S*V;'S;=`*s<%lO*V!R!*bX!b`!dpOr*Vrs(Vsv*Vwx)ex!r*V!r!s!*}!s;'S*V;'S;=`*s<%lO*V!R!+UX!b`!dpOr*Vrs(Vsv*Vwx)ex!g*V!g!h!+q!h;'S*V;'S;=`*s<%lO*V!R!+xY!b`!dpOr!+qrs!,hsv!+qvw!-Swx!.[x!`!+q!`!a!/j!a;'S!+q;'S;=`!0Y<%lO!+qq!,mV!dpOv!,hvx!-Sx!`!,h!`!a!-q!a;'S!,h;'S;=`!.U<%lO!,hP!-VTO!`!-S!`!a!-f!a;'S!-S;'S;=`!-k<%lO!-SP!-kO|PP!-nP;=`<%l!-Sq!-xS!dp|POv(Vx;'S(V;'S;=`(h<%lO(Vq!.XP;=`<%l!,ha!.aX!b`Or!.[rs!-Ssv!.[vw!-Sw!`!.[!`!a!.|!a;'S!.[;'S;=`!/d<%lO!.[a!/TT!b`|POr)esv)ew;'S)e;'S;=`)y<%lO)ea!/gP;=`<%l!.[!R!/sV!b`!dp|POr*Vrs(Vsv*Vwx)ex;'S*V;'S;=`*s<%lO*V!R!0]P;=`<%l!+q!R!0gX!b`!dpOr*Vrs(Vsv*Vwx)ex#c*V#c#d!1S#d;'S*V;'S;=`*s<%lO*V!R!1ZX!b`!dpOr*Vrs(Vsv*Vwx)ex#V*V#V#W!1v#W;'S*V;'S;=`*s<%lO*V!R!1}X!b`!dpOr*Vrs(Vsv*Vwx)ex#h*V#h#i!2j#i;'S*V;'S;=`*s<%lO*V!R!2qX!b`!dpOr*Vrs(Vsv*Vwx)ex#m*V#m#n!3^#n;'S*V;'S;=`*s<%lO*V!R!3eX!b`!dpOr*Vrs(Vsv*Vwx)ex#d*V#d#e!4Q#e;'S*V;'S;=`*s<%lO*V!R!4XX!b`!dpOr*Vrs(Vsv*Vwx)ex#X*V#X#Y!+q#Y;'S*V;'S;=`*s<%lO*V!R!4{Y!b`!dpOr!4trs!5ksv!4tvw!6Vwx!8]x!a!4t!a!b!:]!b;'S!4t;'S;=`!;r<%lO!4tq!5pV!dpOv!5kvx!6Vx!a!5k!a!b!7W!b;'S!5k;'S;=`!8V<%lO!5kP!6YTO!a!6V!a!b!6i!b;'S!6V;'S;=`!7Q<%lO!6VP!6lTO!`!6V!`!a!6{!a;'S!6V;'S;=`!7Q<%lO!6VP!7QOyPP!7TP;=`<%l!6Vq!7]V!dpOv!5kvx!6Vx!`!5k!`!a!7r!a;'S!5k;'S;=`!8V<%lO!5kq!7yS!dpyPOv(Vx;'S(V;'S;=`(h<%lO(Vq!8YP;=`<%l!5ka!8bX!b`Or!8]rs!6Vsv!8]vw!6Vw!a!8]!a!b!8}!b;'S!8];'S;=`!:V<%lO!8]a!9SX!b`Or!8]rs!6Vsv!8]vw!6Vw!`!8]!`!a!9o!a;'S!8];'S;=`!:V<%lO!8]a!9vT!b`yPOr)esv)ew;'S)e;'S;=`)y<%lO)ea!:YP;=`<%l!8]!R!:dY!b`!dpOr!4trs!5ksv!4tvw!6Vwx!8]x!`!4t!`!a!;S!a;'S!4t;'S;=`!;r<%lO!4t!R!;]V!b`!dpyPOr*Vrs(Vsv*Vwx)ex;'S*V;'S;=`*s<%lO*V!R!;uP;=`<%l!4t!V!<TXjSaP!b`!dpOr&Xrs&}sv&Xwx(tx!^&X!^!_*V!_;'S&X;'S;=`*y<%lO&X",
  tokenizers: [Zk, Rk, Ak, Ck, vk, Tk, 0, 1, 2, 3, 4, 5],
  topRules: { Document: [0, 16] },
  dialects: { noMatch: 0, selfClosing: 515 },
  tokenPrec: 517
});
function Xd(n, e) {
  let t = /* @__PURE__ */ Object.create(null);
  for (let i of n.getChildren(wd)) {
    let r = i.getChild(ck), s = i.getChild(al) || i.getChild(vd);
    r && (t[e.read(r.from, r.to)] = s ? s.type.id == al ? e.read(s.from + 1, s.to - 1) : e.read(s.from, s.to) : "");
  }
  return t;
}
function wO(n, e) {
  let t = n.getChild(Ok);
  return t ? e.read(t.from, t.to) : " ";
}
function io(n, e, t) {
  let i;
  for (let r of t)
    if (!r.attrs || r.attrs(i || (i = Xd(n.node.parent.firstChild, e))))
      return { parser: r.parser, bracketed: !0 };
  return null;
}
function Cd(n = [], e = []) {
  let t = [], i = [], r = [], s = [];
  for (let l of n)
    (l.tag == "script" ? t : l.tag == "style" ? i : l.tag == "textarea" ? r : s).push(l);
  let o = e.length ? /* @__PURE__ */ Object.create(null) : null;
  for (let l of e) (o[l.name] || (o[l.name] = [])).push(l);
  return Tf((l, a) => {
    let h = l.type.id;
    if (h == fk) return io(l, a, t);
    if (h == uk) return io(l, a, i);
    if (h == dk) return io(l, a, r);
    if (h == Pd && s.length) {
      let O = l.node, c = O.firstChild, f = c && wO(c, a), u;
      if (f) {
        for (let d of s)
          if (d.tag == f && (!d.attrs || d.attrs(u || (u = Xd(c, a))))) {
            let p = O.lastChild, g = p.type.id == mk ? p.from : O.to;
            if (g > c.to)
              return { parser: d.parser, overlay: [{ from: c.to, to: g }] };
          }
      }
    }
    if (o && h == wd) {
      let O = l.node, c;
      if (c = O.firstChild) {
        let f = o[a.read(c.from, c.to)];
        if (f) for (let u of f) {
          if (u.tagName && u.tagName != wO(O.parent, a)) continue;
          let d = O.lastChild;
          if (d.type.id == al) {
            let p = d.from + 1, g = d.lastChild, Q = d.to - (g && g.isError ? 0 : 1);
            if (Q > p) return { parser: u.parser, overlay: [{ from: p, to: Q }], bracketed: !0 };
          } else if (d.type.id == vd)
            return { parser: u.parser, overlay: [{ from: d.from, to: d.to }] };
        }
      }
    }
    return null;
  });
}
const Wk = 148, vO = 1, zk = 149, Mk = 150, Zd = 2, _k = 151, Ek = 3, Lk = 4, Yk = 152, Rd = [
  9,
  10,
  11,
  12,
  13,
  32,
  133,
  160,
  5760,
  8192,
  8193,
  8194,
  8195,
  8196,
  8197,
  8198,
  8199,
  8200,
  8201,
  8202,
  8232,
  8233,
  8239,
  8287,
  12288
], Vk = 58, Uk = 40, Ad = 95, Dk = 91, br = 45, Bk = 46, Ik = 35, Gk = 37, Nk = 38, Fk = 92, Hk = 10, Kk = 42;
function wn(n) {
  return n >= 65 && n <= 90 || n >= 97 && n <= 122 || n >= 161;
}
function ha(n) {
  return n >= 48 && n <= 57;
}
function TO(n) {
  return ha(n) || n >= 97 && n <= 102 || n >= 65 && n <= 70;
}
const qd = (n, e, t) => (i, r) => {
  for (let s = !1, o = 0, l = 0; ; l++) {
    let { next: a } = i;
    if (wn(a) || a == br || a == Ad || s && ha(a))
      !s && (a != br || l > 0) && (s = !0), o === l && a == br && o++, i.advance();
    else if (a == Fk && i.peek(1) != Hk) {
      if (i.advance(), TO(i.next)) {
        do
          i.advance();
        while (TO(i.next));
        i.next == 32 && i.advance();
      } else i.next > -1 && i.advance();
      s = !0;
    } else {
      s && i.acceptToken(
        o >= 2 && r.canShift(Zd) ? e : a == Uk ? t : n
      );
      break;
    }
  }
}, Jk = new de(
  qd(zk, Zd, Mk),
  { contextual: !0 }
), e$ = new de(
  qd(_k, Ek, Lk),
  { contextual: !0 }
), t$ = new de((n) => {
  if (Rd.includes(n.peek(-1))) {
    let { next: e } = n;
    (wn(e) || e == Ad || e == Ik || e == Bk || e == Kk || e == Dk || e == Vk && wn(n.peek(1)) || e == br || e == Nk) && n.acceptToken(Wk);
  }
}), i$ = new de((n) => {
  if (!Rd.includes(n.peek(-1))) {
    let { next: e } = n;
    if (e == Gk && (n.advance(), n.acceptToken(vO)), wn(e)) {
      do
        n.advance();
      while (wn(n.next) || ha(n.next));
      n.acceptToken(vO);
    }
  }
});
function XO(n) {
  return /^#[a-f\d]{3}([a-f\d]{3}([a-f\d]{2})?)?$/i.test(n) ? Yk : -1;
}
const n$ = Dt({
  "AtKeyword import charset namespace keyframes media supports font-feature-values": m.definitionKeyword,
  "from to selector scope MatchFlag": m.keyword,
  NamespaceName: m.namespace,
  KeyframeName: m.labelName,
  KeyframeRangeName: m.operatorKeyword,
  TagName: m.tagName,
  ClassName: m.className,
  PseudoClassName: m.constant(m.className),
  IdName: m.labelName,
  "FeatureName PropertyName": m.propertyName,
  AttributeName: m.attributeName,
  NumberLiteral: m.number,
  KeywordQuery: m.keyword,
  UnaryQueryOp: m.operatorKeyword,
  "CallTag ValueName FontName": m.atom,
  VariableName: m.variableName,
  Callee: m.operatorKeyword,
  Unit: m.unit,
  "UniversalSelector NestingSelector": m.definitionOperator,
  "MatchOp CompareOp": m.compareOperator,
  "ChildOp SiblingOp, LogicOp": m.logicOperator,
  BinOp: m.arithmeticOperator,
  Important: m.modifier,
  Comment: m.blockComment,
  ColorLiteral: m.color,
  "ParenthesizedContent StringLiteral": m.string,
  ":": m.punctuation,
  PseudoOp: m.derefOperator,
  "; , |": m.separator,
  "( )": m.paren,
  "[ ]": m.squareBracket,
  "{ }": m.brace
}), r$ = { __proto__: null, lang: 44, "nth-child": 44, "nth-last-child": 44, "nth-of-type": 44, "nth-last-of-type": 44, dir: 44, "host-context": 44, if: 88, url: 158, "url-prefix": 158, domain: 158, regexp: 158 }, s$ = { __proto__: null, or: 102, and: 102, not: 112, only: 112, layer: 212 }, o$ = { __proto__: null, selector: 118, style: 124, layer: 208 }, l$ = { __proto__: null, "@import": 204, "@media": 216, "@charset": 220, "@namespace": 224, "@keyframes": 230, "@supports": 242, "@scope": 246, "@font-feature-values": 252 }, a$ = { __proto__: null, to: 249 }, h$ = Yt.deserialize({
  version: 14,
  states: "MrQYQdOOO$TQdOOP$[O`OOO%XQaO'#CfOOQP'#Ce'#CeO%`QdO'#CgO%eQ`O'#CgO%jQaO'#FrO&eQdO'#CkO'XQaO'#CcO'cQdO'#CnOOQP'#ES'#ESOOQP'#ER'#ERO'nQdO'#ETO'yQdO'#E[O'yQdO'#E_OOQP'#Fr'#FrO)`QhO'#FQOOQS'#Fq'#FqOOQS'#FT'#FTQYQdOOO)gQdO'#EeO*vQhO'#EkO)gQdO'#EmO*}QdO'#EoO+YQdO'#ErO*[QhO'#ExO+bQdO'#EzO+mQdO'#E}O+rQaO'#CfO+yQ`O'#EbO,OQ`O'#GPO,ZQdO'#GPQOQ`OOP,eO&jO'#CaPOOO)CAa)CAaOOQP'#Ci'#CiOOQP,59R,59RO%`QdO,59ROOQP'#Cm'#CmOOQP,59V,59VO&eQdO,59VO,pQdO,59YOOQP,5:m,5:mO'nQdO,5:oO'yQdO,5:vO'yQdO,5:xO'yQdO,5:yO'yQdO'#F[O,{Q`O,58}O-TQdO'#EaOOQS,58},58}OOQP'#Cq'#CqOOQO'#EP'#EPOOQP,59Y,59YO-[Q`O,59YO-aQ`O,59YO-fQpO'#EUO-qQdO'#EVO-vQ`O'#EVO-{QpO,5:oO.iQaO,5:vO/PQaO,5:yOOQW'#D]'#D]O0OQhO'#DgO0cQhO,5;lO*[QhO'#DeO0pQ`O'#DnO0uQhO'#D{OOQW'#Fx'#FxOOQS,5;l,5;lO0zQ`O'#DhO1PQ`O'#DkOOQS-E9R-E9ROOQ['#Cv'#CvO1UQdO'#CwO1iQdO'#C|O1|QdO'#DPOOQ['#DQ'#DQO2aQ!pO'#DRO4jQ!jO,5;POOQO'#DW'#DWO-aQ`O'#DVO4zQ!nO'#FuO6}Q`O'#DXO7SQ`O'#D|OOQ['#Fu'#FuO7XQhO'#GSO7gQ`O,5;VO7lQ!bO,5;XOOQS'#Eq'#EqO7tQ`O,5;ZO7yQdO,5;ZOOQO'#Et'#EtO8RQ`O,5;^O8WQhO,5;dO'yQdO'#DjOOQS,5;f,5;fO0zQ`O,5;fO8`QdO,5;fOOQS'#Fc'#FcO8hQdO'#FPO7gQ`O,5;iO8pQdO,5:|O9QQdO'#F^O9_Q`O,5<kO9_Q`O,5<kPOOO'#FS'#FSP9jO&jO,58{POOO,58{,58{OOQP1G.m1G.mOOQP1G.q1G.qOOQP1G.t1G.tO-[Q`O1G.tO-aQ`O1G.tO9uQpO1G0ZO9}QaO1G0bO:eQaO1G0dO:{QaO1G0eO;cQaO,5;vOOQO-E9Y-E9YOOQS1G.i1G.iO;mQ`O,5:{O;rQdO'#EQO;yQdO'#CuOOQO'#EX'#EXOOQO,5:q,5:qO-qQdO,5:qOOQP1G0Z1G0ZO)gQdO1G0ZO<QQ!jO'#D]O<`Q!bO,59xO<hQhO,5:ROOQO'#Dc'#DcOOQO'#Fy'#FyO<cQ!bO,59|O<pQhO'#FdO*[QhO,59zO*[QhO'#FdO=hQhO1G1WOOQS1G1W1G1WO=rQhO,5:PO>mQhO'#DoOOQW,5:Y,5:YOOQW,5:g,5:gOOQW,5:S,5:SO>wQhO,5:VO?cQ!fO'#FvOOQS'#Fv'#FvOOQS'#FV'#FVO@pQdO,59cOOQ[,59c,59cOATQdO,59hOOQ[,59h,59hOAhQdO,59kOOQ[,59k,59kOOQ[,59m,59mO)gQdO,59oOA{QhO'#EgOOQW'#Eg'#EgOBjQ`O1G0kO4sQhO1G0kOOQ[,59q,59qO*[QhO'#DZOOQ[,59s,59sOBoQ#tO,5:hOBzQhO'#F`OCXQ`O,5<nOOQS1G0q1G0qOOQS1G0s1G0sOOQS1G0u1G0uOCdQ`O1G0uOCiQdO'#EuOOQS1G0x1G0xOOQS1G1O1G1OOCtQaO,5:UO7gQ`O1G1QOOQS1G1Q1G1QO0zQ`O1G1QOOQS-E9a-E9aOOQS1G1T1G1TOC{Q!fO1G0hODcQ`O'#EdOOQO1G0h1G0hOOQO,5;x,5;xODhQdO,5;xOOQO-E9[-E9[ODuQ`O1G2VPOOO-E9Q-E9QPOOO1G.g1G.gOOQP7+$`7+$`OOQP7+%u7+%uO)gQdO7+%uOOQS1G0g1G0gOEQQaO'#F}OE[Q`O,5:lOEaQ!fO'#FUOF_QdO'#FtOFiQ`O,59aOOQO1G0]1G0]OFnQ!bO7+%uO)gQdO1G/dOFyQhO1G/hOOQW1G/m1G/mOOQW1G/f1G/fOG[QhO,5<OOOQW-E9b-E9bOOQS7+&r7+&rOHSQhO'#D]OHbQhO'#F|OHmQ`O'#F|OHrQ`O,5:ZOHwQ!bO'#D_O>wQhO'#DmOISQhO'#DsOI[QhO'#DuOIaQ!jO'#F{OOQO'#F{'#F{OIlQ`O'#DxOItQ!bO'#DzOOQO'#Fz'#FzOIyQ`O1G/qOOQS-E9T-E9TOOQ[1G.}1G.}OOQ[1G/S1G/SOOQ[1G/V1G/VOOQ[1G/Z1G/ZOJOQdO,5;ROOQS7+&V7+&VOJTQ`O7+&VOJYQhO'#D[OJbQ`O,59uO*[QhO,59uOOQ[1G0S1G0SOJjQ`O1G0SOJoQhO,5;zOOQO-E9^-E9^OOQS7+&a7+&aOJ}QbO'#DROOQO'#Ew'#EwOK]Q`O'#EvOOQO'#Ev'#EvOKhQ`O'#FaOKpQdO,5;aOOQS,5;a,5;aOOQ[1G/p1G/pOOQS7+&l7+&lO7gQ`O7+&lOK{Q!fO'#F]O)gQdO'#F]OMSQdO7+&SOOQO7+&S7+&SOOQO,5;O,5;OOOQO1G1d1G1dOMgQ!bO<<IaOMrQdO'#FZOM|Q`O,5<iOOQP1G0W1G0WOOQS-E9S-E9SONUQdO'#FYON`Q`O,5<`OOQ]1G.{1G.{OOQP<<Ia<<IaONhQ`O<<IaONmQdO7+%OOOQO'#D_'#D_ONtQ!bO7+%SON|QhO'#FXO! ZQ`O,5<hO)gQdO,5<hOOQW1G/u1G/uO! cQ`O,5:XO>wQhO'#DtOOQO,5:_,5:_O! hQhO,5:aO! pQhO,5:fO)gQdO,5:dOOQW7+%]7+%]OOQO'#Ei'#EiO! wQ`O1G0mOOQS<<Iq<<IqO)gQdO,59vO!!kQhO1G/aOOQ[1G/a1G/aO!!rQ`O1G/aOOQW-E9U-E9UOOQ[7+%n7+%nOOQO,5;b,5;bOClQdO'#FbOKhQ`O,5;{OOQS,5;{,5;{OOQS-E9_-E9_OOQS1G0{1G0{OOQS<<JW<<JWO!!zQ!fO,5;wOOQS-E9Z-E9ZOOQO<<In<<InOOQPAN>{AN>{O!$RQ`OAN>{O!$WQaO,5;uOOQO-E9X-E9XO!$bQdO,5;tOOQO-E9W-E9WOOQW<<Hj<<HjOOQW<<Hn<<HnO!$lQhO<<HnO!$}QhO'#D]O!%]QhO,5;sO!%hQ`O,5;sOOQO-E9V-E9VO!%mQdO1G2SO!%wQhO1G/sO!&PQ`O,5:`O>wQhO'#DwOOQO1G/{1G/{O!&UQ!bO1G0QO!&^QdO1G0OOJOQdO'#F_O!&eQ`O7+&XOOQW7+&X7+&XO!&mQ!bO1G/bOOQ[7+${7+${O!&xQhO7+${P!'PQ`O'#FWOOQO,5;|,5;|OOQO-E9`-E9`OOQS1G1g1G1gOOQPG24gG24gO!'UQ`OAN>YO)gQdO1G1_O!'ZQ`O7+'nOOQO1G/z1G/zO!'cQ`O,5:cO!'hQhO7+%lOOQO,5;y,5;yOOQO-E9]-E9]OOQW<<Is<<IsOOQ[<<Hg<<HgPOQW,5;r,5;rOOQWG23tG23tO!'oQdO7+&yOOQO1G/}1G/}OOQO<<IW<<IW",
  stateData: "!(S~O$`OS$aQQ~OWVO^`O`WOcYOdYOlaOo]O#P^O#S_O#YeO#`fO#bgO#dhO#giO#mjO#okO#rlO$ZRO$^ZO$gTO$rZO~OQnOWVO^`O`WOcYOdYOlaOo]O#P^O#S_O#YeO#`fO#bgO#dhO#giO#mjO#okO#rlO$ZmO$^ZO$gTO$rZO~O$X$sP~P!mO$arO~O`YXcYXdYXoYXrYX!eYX#PYX#SYX$YYX$^YX$g[X$rYX~OgYX~P$aO$ZtO~O$gvO~O$gvO`$fXc$fXd$fXo$fXr$fX!e$fX#P$fX#S$fX$Y$fX$^$fX$r$fXg$fX~O$ZwO~O`yOczOdzOo|O#P}O#S!PO$Y!OO$^ZO$rZO~Or!SO!e!QO~P&jOf!YO$Z!UO$[!VO~OW!]O$Z!ZO$g![O~OWVO^`O`WOcYOdYOo]O#P^O#S_O$ZRO$^ZO$gTO$rZO~OS!eOc!fOd!fOh!bOr!SO!Y!dO!]!iO!`!jO$]!aO~Om!hO~P(qOQ!uOh!mOo!nOr!oOv!xO|!vO!q!wO$Z!lO$[!sO$^!pO$k!qO~OS!eOc!fOd!fOh!bO!Y!dO!]!iO!`!jO$]!aO~Or$vP~P*[Ov!}O!q!wO$Z!|O~Ov#PO$Z#PO~Oh#SOr!SO#p#UO~O$Z#WO~Oc#VX~P$aOc#ZO~Om#[O$X$sXq$sX~O$X$sXq$sX~P!mO$b#_O$c#_O$d#aO~Of#fO$Z!UO$[!VO~Or!SO!e!QO~Oq$sP~P!mOh#oO~Oh#pO~On!xX!|!xX$g!zX~O$Z#qO~O$g#sO~On#tO!|#uO~O`yOczOdzOo|O$^ZO$rZO~Or#Oa!e#Oa#P#Oa#S#Oa$Y#Oag#Oa~P.TOr#Ra!e#Ra#P#Ra#S#Ra$Y#Rag#Ra~P.TOS!eOc!fOd!fOh!bO!Y!dO!]!iO!`!jO~OR#zOv#zO$]#vO$^#yO$k!qO~P/gOm$QO!T#}O!e$OO~P(qOh$SO~O$]$UO~Oh#SO~Oh$WO~O`$YOc$YOg$]Ol$YOm$YO~P)gO`$YOc$YOl$YOm$YOn$_O~P)gO`$YOc$YOl$YOm$YOq$aO~P)gOP$bOSuXcuXduXhuXmuXxuX!YuX!]uX!`uX#[uX#^uX$]uX!WuXQuX`uXguXluXouXruXvuX|uX!quX$ZuX$[uX$^uX$kuXnuXquX!euX$XuX$uuX!}uX~Ox$cO#[$dO#^$eOm$vP~P*[Oh#pOS$iXc$iXd$iXm$iXx$iX!Y$iX!]$iX!`$iX#[$iX#^$iX$]$iXQ$iX`$iXg$iXl$iXo$iXr$iXv$iX|$iX!q$iX$Z$iX$[$iX$^$iX$k$iXn$iXq$iX!e$iX$X$iX$u$iX!}$iX~Oh$iO~Oh$kO~O!T#}O!e$lOr$vXm$vX~Or!SO~Om$oOx$cO~Om$pO~Ov$qO!q!wO~Or$rO~Or!SO!T#}O~Or!SO#p$xO~O$Z#WOr#sX~O$u$|Om#Ua$X#Uaq#Ua~P)gOm$QX$X$QXq$QX~P!mOm#[O$X$saq$sa~O$b#_O$c#_O$d%TO~On%VO!|%WO~Or#Oi!e#Oi#P#Oi#S#Oi$Y#Oig#Oi~P.TOr#Qi!e#Qi#P#Qi#S#Qi$Y#Qig#Qi~P.TOr#Ri!e#Ri#P#Ri#S#Ri$Y#Rig#Ri~P.TOr$Oa!e$Oa~P&jOq%XO~Og$qP~P'yOg$hP~P)gOc!RXg!PX!T!PX!W!RX~Oc%aO!W%bO~Og%cO!T#}O~O!T#}OS$WXc$WXd$WXh$WXm$WXr$WX!Y$WX!]$WX!`$WX!e$WX$]$WX~Om%gO!e$OO~P(qO!T#}OS!Xac!Xad!Xah!Xam!Xar!Xa!Y!Xa!]!Xa!`!Xa!e!Xa$]!Xag!Xa~O$]%hOg$pP~P/gOR#zOS!eOh%mOv#zO!Y%nO$]%lO$^#yO$k!qO~Ox$cOQ$jX`$jXc$jXg$jXh$jXl$jXm$jXo$jXr$jXv$jX|$jX!q$jX$Z$jX$[$jX$^$jX$k$jXn$jXq$jX~O`$YOc$YOg%wOl$YOm$YO~P)gO`$YOc$YOl$YOm$YOn%xO~P)gO`$YOc$YOl$YOm$YOq%yO~P)gOh%{OS#ZXc#ZXd#ZXm#ZX!Y#ZX!]#ZX!`#ZX$]#ZX~Om%|O~Og&ROv&SO!r&SO~Or$SX!e$SXm$SX~P*[O!e$lOr$vam$va~Om&VO~Oq&^O$Z&XO$k&WO~Og&_O~P&jOx$cO!e&cO$u$|Om#Ui$X#Uiq#Ui~P)gO$t&fO~Om$Qa$X$Qaq$Qa~P!mOm#[O$X$siq$si~O!e&iOg$qX~P&jOg&kO~Ox$cOQ#xXg#xXh#xXo#xXr#xXv#xX|#xX!e#xX!q#xX$Z#xX$[#xX$^#xX$k#xX~O!e&mOg$hX~P)gOg&oO~On&pOx$cO!}&qO~OR#zOv#zO$]&sO$^#yO$k!qO~O!T#}OS$Wac$Wad$Wah$Wam$War$Wa!Y$Wa!]$Wa!`$Wa!e$Wa$]$Wa~Oc!dXg!PX!T!PX!e!PX~O!T#}O!e&uOg$pX~Oc&wO~Og&xO~Oc!mXg!mX!W!RX~OS!eOh&zO~O!T&|O~O!T&|O!W&}Og$oX~Oc'OOg!lX~O!W&}O~Og'PO~O$Z'QO~Om'SO~Oc'TO!T#}O~Og'VOm'UO~Og'YO~O!T#}Or$Sa!e$Sam$Sa~OP$bOruX!euXguX~O$k&WOr#jX!e#jX~Or!SO!e'[O~Oq'`O$Z&XO$k&WO~Ox$cOQ$PXh$PXm$PXo$PXr$PXv$PX|$PX!e$PX!q$PX$X$PX$Z$PX$[$PX$^$PX$k$PX$u$PXq$PX~O!e&cO$u$|Om#Uq$X#Uqq#Uq~P)gOn'eOx$cO!}'fO~Og#}X!e#}X~P'yO!e&iOg$qa~Og#|X!e#|X~P)gO!e&mOg$ha~On'eO~Og'kO~P)gOg'lO!W'mO~O$]'nOg#{X!e#{X~P/gO!e&uOg$pa~Og'sO~OS!eOh'uO~OS!eO~PFyO`'yOg'{O~OS#zac#zad#zah#za!Y#za!]#za!`#za$]#za~Og'}O~P!!POg'}Om(OO~Ox$cOQ$Pah$Pam$Pao$Par$Pav$Pa|$Pa!e$Pa!q$Pa$X$Pa$Z$Pa$[$Pa$^$Pa$k$Pa$u$Paq$Pa~On(TO~Og#}a!e#}a~P&jOg#|a!e#|a~P)gOR#zOv#zO$]&sO$^#yO$k&WO~Oc!fXg!PX!T!PX!e!PX~O!T#}Og#{a!e#{a~Oc(VO~O!e&uOg$pi~P)gOg!ai!T!ji~Og(XO~O!W(ZOg!ni~Og!li~P)gO`'yOg(^O~Ox$cOg!Oim!Oi~Og(_O~P!!POm(`O~Og(aO~O!e&uOg$pq~Og(cO~OS!eO~P!$lOg#{q!e#{q~P)gO$`!r$a$k`$kx#S~",
  goto: "8^$wPPPPP$xP${P%U%h%U%z&^P%UP&d%UPP&jPPP&p&z&zPPPP&zPP&z&z'jP&zP&z(m&zP)])`)f)f)x)fP)f*_P)fP)f)fP*j)fP*v*|+r+uP+x*v+{*v,O,U,X,_,X)f,ePP-Z-a%U-g%U.V.V.].aPP%UP%U%UP.g/c/p/w${P0QP0TP${P${P${P0Z${P0^0a0d0k${P${PP${P0p${P0s0y1Y1t2S2Y2d2j2p2v2|3W3^3d3j3p3vPPPPPPPPPPPP3|4VP4{5O6SP6[7U7k,X7w7zP7}PP8TRsQ_bOPdp!S#[%Pq`OP^_dp}!O!P!Q!S#S#[#o%P&iqSOP^_dp}!O!P!Q!S#S#[#o%P&iqUOP^_dp}!O!P!Q!S#S#[#o%P&iQuTR#bvQxWR#cyQ!WYR#dzQ#d!YS$h!t!uR%U#f!Z!xeg!m!n!o#Z#p#u$[$^$`$c${%W%]%a&c&d&m&r&w'O'T'i'r'x(V(b!Y!xeg!m!n!o#Z#p#u$[$^$`$c${%W%]%a&c&d&m&r&w'O'T'i'r'x(V(bb#z!b$W%b%m&z&}'m'u(ZU&Z$r&]'[R'Z&Y!Z!teg!m!n!o#Z#p#u$[$^$`$c${%W%]%a&c&d&m&r&w'O'T'i'r'x(V(bR$j!vQ&P$iR'W&Qq!gafj!b!c!d!r#}$O$P$S$g$i$l&Q&uQ#w!bW%s$W%m&z'uQ&t%bQ'w&}Q(U'mR(d(Zc#z!b$W%b%m&z&}'m'u(ZQ#VkQ$V!iQ$v#UR&a$xX%q$W%m&z'up!gafj!b!c!d!r#}$O$P$S$g$i$l&Q&uW%p$W%m&z'uQ&{%nQ'v&|Q'w&}R(d(ZR$T!eR%j$SR'p&uR&{%nX%o$W%m&z'uR'v&|X%t$W%m&z'uX%r$W%m&z'u!Y!xeg!m!n!o#Z#p#u$[$^$`$c${%W%]%a&c&d&m&r&w'O'T'i'r'x(V(bQ!}hR$q#OQ!XYR#ezQ#d!XR%U#ep[OP^_dp}!O!P!Q!S#S#[#o%P&ie{X!_!`#h#i#j#k$u%Y'gQ!^]R#g|T!]]|Q#r![R%_#sQ!TXQ!haQ#TkQ#m!RQ$Q!cQ$n!zQ$t#RQ$w#VQ$z#YQ%g$PQ&`$vQ'^&[Q'a&aR(S']SoP!SQ#^pQ%O#[R&g%PZnPp!S#[%PQ$}#ZQ&e${R'd&dR$g!rQ'R%{R(['yR#OhR#QiR$s#QS&[$r&]R(Q'[V&Y$r&]'[R#YlQ#`rR%S#`QdOSpP!SU!kdp%PR%P#[Q%]#p[&l%]&r'i'r'x(bQ&r%aQ'i&mQ'r&wQ'x'OR(b(VQ$[!mQ$^!nQ$`!oV%v$[$^$`Q&Q$iR'X&QQ&v%iS'q&v(WR(W'rQ&n%]R'j&nQ&j%YR'h&jQ!RXR#l!RQ&d${R'c&dQ#]oS%Q#]%RR%R#^Q'z'RR(]'zQ$m!yR&U$mQ&]$rR'_&]Q']&[R(R']Q#XlR$y#XQ$P!cR%f$P_cOPdp!S#[%P^XOPdp!S#[%PQ!_^Q!`_Q#h}Q#i!OQ#j!PQ#k!QQ$u#SQ%Y#oR'g&iR%^#pQ!reQ!{g[$X!m!n!o$[$^$`Q${#Zh%[#p%]%a&m&r&w'O'i'r'x(V(bQ%`#uQ%z$cS&b${&dQ&h%WQ'b&cR'|'T]$Z!m!n!o$[$^$`Q!caU!yf!r$gQ#RjQ#x!bS#|!c$PQ$R!dQ%d#}Q%e$OQ%i$SS&O$i&QQ&T$lR'o&uQ#{!bW%s$W%m&z'uQ&t%bQ'w&}Q(U'mR(d(ZQ%u$WQ&y%mQ't&zR(Y'uR%k$SR%Z#oQqPR#n!SQ!zfQ$f!rR%}$g",
  nodeNames: "⚠ Unit VariableName VariableName QueryCallee Comment StyleSheet RuleSet UniversalSelector TagSelector TagName NamespacedTagSelector NamespaceName TagName NestingSelector ClassSelector . ClassName PseudoClassSelector : :: PseudoClassName PseudoClassName ) ( ArgList ValueName ParenthesizedValue AtKeyword ; ] [ BracketedValue } { BracedValue ColorLiteral NumberLiteral StringLiteral BinaryExpression BinOp CallExpression Callee IfExpression if ArgList IfBranch KeywordQuery FeatureQuery FeatureName BinaryQuery LogicOp ComparisonQuery ColorLiteral CompareOp UnaryQuery UnaryQueryOp ParenthesizedQuery SelectorQuery selector ParenthesizedSelector StyleQuery style ParenthesedQuery CallQuery ArgList PropertyName , PropertyName UnaryQuery ParenthesedQuery BinaryQuery ParenthesedQuery ParenthesedQuery StyleFeature PropertyName StyleRange PseudoQuery CallLiteral CallTag ParenthesizedContent PseudoClassName ArgList IdSelector IdName AttributeSelector AttributeName NamespacedAttribute NamespaceName AttributeName MatchOp MatchFlag ChildSelector ChildOp DescendantSelector SiblingSelector SiblingOp Block Declaration PropertyName Important ImportStatement import Layer layer LayerName layer MediaStatement media CharsetStatement charset NamespaceStatement namespace NamespaceName KeyframesStatement keyframes KeyframeName KeyframeList KeyframeSelector KeyframeRangeName SupportsStatement supports ScopeStatement scope to FontFeatureStatement font-feature-values FontName AtRule Styles",
  maxTerm: 176,
  nodeProps: [
    ["isolate", -2, 5, 38, ""],
    ["openedBy", 23, "(", 30, "[", 33, "{"],
    ["closedBy", 24, ")", 31, "]", 34, "}"]
  ],
  propSources: [n$],
  skippedNodes: [0, 5, 130],
  repeatNodeCount: 17,
  tokenData: "IO~R!bOX%ZX^&R^p%Zpq&Rqr)ers)vst+jtu/wuv%Zvw0qwx1Sxy2qyz3Sz{3X{|3r|}8e}!O8v!O!P9e!P!Q9|!Q![:u![!];p!]!^<l!^!_<}!_!`=y!`!a>^!a!b%Z!b!c?_!c!k%Z!k!lAl!l!u%Z!u!vAl!v!}%Z!}#OA}#O#P%Z#P#QB`#Q#R/w#R#]%Z#]#^Bq#^#g%Z#g#hAl#h#o%Z#o#pGU#p#qGg#q#rHO#r#sHa#s#y%Z#y#z&R#z$f%Z$f$g&R$g#BY%Z#BY#BZ&R#BZ$IS%Z$IS$I_&R$I_$I|%Z$I|$JO&R$JO$JT%Z$JT$JU&R$JU$KV%Z$KV$KW&R$KW&FU%Z&FU&FV&R&FV;'S%Z;'S;=`Hx<%lO%Z`%^SOy%jz;'S%j;'S;=`%{<%lO%j`%oS!r`Oy%jz;'S%j;'S;=`%{<%lO%j`&OP;=`<%l%j~&Wh$`~OX%jX^'r^p%jpq'rqy%jz#y%j#y#z'r#z$f%j$f$g'r$g#BY%j#BY#BZ'r#BZ$IS%j$IS$I_'r$I_$I|%j$I|$JO'r$JO$JT%j$JT$JU'r$JU$KV%j$KV$KW'r$KW&FU%j&FU&FV'r&FV;'S%j;'S;=`%{<%lO%j~'yh$`~!r`OX%jX^'r^p%jpq'rqy%jz#y%j#y#z'r#z$f%j$f$g'r$g#BY%j#BY#BZ'r#BZ$IS%j$IS$I_'r$I_$I|%j$I|$JO'r$JO$JT%j$JT$JU'r$JU$KV%j$KV$KW'r$KW&FU%j&FU&FV'r&FV;'S%j;'S;=`%{<%lO%jj)jS$uYOy%jz;'S%j;'S;=`%{<%lO%j~)yWOY)vZr)vrs*cs#O)v#O#P*h#P;'S)v;'S;=`+d<%lO)v~*hOv~~*kRO;'S)v;'S;=`*t;=`O)v~*wXOY)vZr)vrs*cs#O)v#O#P*h#P;'S)v;'S;=`+d;=`<%l)v<%lO)v~+gP;=`<%l)vj+maOy%jz}%j}!O,r!O!Q%j!Q![,r![!c%j!c!},r!}#O%j#O#P.O#P#R%j#R#S,r#S#T%j#T#o,r#o$g%j$g;'S,r;'S;=`/q<%lO,rj,ya$rY!r`Oy%jz}%j}!O,r!O!Q%j!Q![,r![!c%j!c!},r!}#O%j#O#P.O#P#R%j#R#S,r#S#T%j#T#o,r#o$g%j$g;'S,r;'S;=`/q<%lO,rj.TV!r`OY,rYZ%jZy,ryz.jz;'S,r;'S;=`/q<%lO,rY.oX$rY}!O.j!Q![.j!c!}.j#O#P/[#R#S.j#T#o.j$g;'S.j;'S;=`/k<%lO.jY/_SOY.jZ;'S.j;'S;=`/k<%lO.jY/nP;=`<%l.jj/tP;=`<%l,rd/zUOy%jz!_%j!_!`0^!`;'S%j;'S;=`%{<%lO%jd0eS!|S!r`Oy%jz;'S%j;'S;=`%{<%lO%jb0vS^QOy%jz;'S%j;'S;=`%{<%lO%j~1VWOY1SZw1Swx*cx#O1S#O#P1o#P;'S1S;'S;=`2k<%lO1S~1rRO;'S1S;'S;=`1{;=`O1S~2OXOY1SZw1Swx*cx#O1S#O#P1o#P;'S1S;'S;=`2k;=`<%l1S<%lO1S~2nP;=`<%l1Sj2vShYOy%jz;'S%j;'S;=`%{<%lO%j~3XOg~n3`UWQxWOy%jz!_%j!_!`0^!`;'S%j;'S;=`%{<%lO%jj3yWxW#SQOy%jz!O%j!O!P4c!P!Q%j!Q![7h![;'S%j;'S;=`%{<%lO%jj4hU!r`Oy%jz!Q%j!Q![4z![;'S%j;'S;=`%{<%lO%jj5RY!r`$kYOy%jz!Q%j!Q![4z![!g%j!g!h5q!h#X%j#X#Y5q#Y;'S%j;'S;=`%{<%lO%jj5vY!r`Oy%jz{%j{|6f|}%j}!O6f!O!Q%j!Q![6}![;'S%j;'S;=`%{<%lO%jj6kU!r`Oy%jz!Q%j!Q![6}![;'S%j;'S;=`%{<%lO%jj7UU!r`$kYOy%jz!Q%j!Q![6}![;'S%j;'S;=`%{<%lO%jj7o[!r`$kYOy%jz!O%j!O!P4z!P!Q%j!Q![7h![!g%j!g!h5q!h#X%j#X#Y5q#Y;'S%j;'S;=`%{<%lO%jj8jS!eYOy%jz;'S%j;'S;=`%{<%lO%jj8{WxWOy%jz!O%j!O!P4c!P!Q%j!Q![7h![;'S%j;'S;=`%{<%lO%jj9jU`YOy%jz!Q%j!Q![4z![;'S%j;'S;=`%{<%lO%j~:RTxWOy%jz{:b{;'S%j;'S;=`%{<%lO%j~:iS!r`$a~Oy%jz;'S%j;'S;=`%{<%lO%jj:z[$kYOy%jz!O%j!O!P4z!P!Q%j!Q![7h![!g%j!g!h5q!h#X%j#X#Y5q#Y;'S%j;'S;=`%{<%lO%jj;uUcYOy%jz![%j![!]<X!];'S%j;'S;=`%{<%lO%jj<`SdY!r`Oy%jz;'S%j;'S;=`%{<%lO%jj<qSmYOy%jz;'S%j;'S;=`%{<%lO%jh=SU!WWOy%jz!_%j!_!`=f!`;'S%j;'S;=`%{<%lO%jh=mS!WW!r`Oy%jz;'S%j;'S;=`%{<%lO%jl>QS!WW!|SOy%jz;'S%j;'S;=`%{<%lO%jj>eV#PQ!WWOy%jz!_%j!_!`=f!`!a>z!a;'S%j;'S;=`%{<%lO%jb?RS#PQ!r`Oy%jz;'S%j;'S;=`%{<%lO%jj?bYOy%jz}%j}!O@Q!O!c%j!c!}@o!}#T%j#T#o@o#o;'S%j;'S;=`%{<%lO%jj@VW!r`Oy%jz!c%j!c!}@o!}#T%j#T#o@o#o;'S%j;'S;=`%{<%lO%jj@v[lY!r`Oy%jz}%j}!O@o!O!Q%j!Q![@o![!c%j!c!}@o!}#T%j#T#o@o#o;'S%j;'S;=`%{<%lO%jhAqS!}WOy%jz;'S%j;'S;=`%{<%lO%jjBSSoYOy%jz;'S%j;'S;=`%{<%lO%jnBeSn^Oy%jz;'S%j;'S;=`%{<%lO%jjBvU!}WOy%jz#a%j#a#bCY#b;'S%j;'S;=`%{<%lO%jbC_U!r`Oy%jz#d%j#d#eCq#e;'S%j;'S;=`%{<%lO%jbCvU!r`Oy%jz#c%j#c#dDY#d;'S%j;'S;=`%{<%lO%jbD_U!r`Oy%jz#f%j#f#gDq#g;'S%j;'S;=`%{<%lO%jbDvU!r`Oy%jz#h%j#h#iEY#i;'S%j;'S;=`%{<%lO%jbE_U!r`Oy%jz#T%j#T#UEq#U;'S%j;'S;=`%{<%lO%jbEvU!r`Oy%jz#b%j#b#cFY#c;'S%j;'S;=`%{<%lO%jbF_U!r`Oy%jz#h%j#h#iFq#i;'S%j;'S;=`%{<%lO%jbFxS$tQ!r`Oy%jz;'S%j;'S;=`%{<%lO%jjGZSrYOy%jz;'S%j;'S;=`%{<%lO%jfGlU$gUOy%jz!_%j!_!`0^!`;'S%j;'S;=`%{<%lO%jjHTSqYOy%jz;'S%j;'S;=`%{<%lO%jfHfU#SQOy%jz!_%j!_!`0^!`;'S%j;'S;=`%{<%lO%j`H{P;=`<%l%Z",
  tokenizers: [t$, i$, Jk, e$, 1, 2, 3, 4, new Nr("m~RRYZ[z{a~~g~aO$c~~dP!P!Qg~lO$d~~", 28, 156)],
  topRules: { StyleSheet: [0, 6], Styles: [1, 129] },
  dynamicPrecedences: { 97: 1 },
  specialized: [{ term: 172, get: (n, e) => XO(n) << 1, external: XO }, { term: 150, get: (n) => r$[n] || -1 }, { term: 151, get: (n) => s$[n] || -1 }, { term: 4, get: (n) => o$[n] || -1 }, { term: 28, get: (n) => l$[n] || -1 }, { term: 149, get: (n) => a$[n] || -1 }],
  tokenPrec: 2433
});
let no = null;
function ro() {
  if (!no && typeof document == "object" && document.body) {
    let { style: n } = document.body, e = [], t = /* @__PURE__ */ new Set();
    for (let i in n)
      i != "cssText" && i != "cssFloat" && typeof n[i] == "string" && (/[A-Z]/.test(i) && (i = i.replace(/[A-Z]/g, (r) => "-" + r.toLowerCase())), t.has(i) || (e.push(i), t.add(i)));
    no = e.sort().map((i) => ({ type: "property", label: i, apply: i + ": " }));
  }
  return no || [];
}
const CO = /* @__PURE__ */ [
  "active",
  "after",
  "any-link",
  "autofill",
  "backdrop",
  "before",
  "checked",
  "cue",
  "default",
  "defined",
  "disabled",
  "empty",
  "enabled",
  "file-selector-button",
  "first",
  "first-child",
  "first-letter",
  "first-line",
  "first-of-type",
  "focus",
  "focus-visible",
  "focus-within",
  "fullscreen",
  "has",
  "host",
  "host-context",
  "hover",
  "in-range",
  "indeterminate",
  "invalid",
  "is",
  "lang",
  "last-child",
  "last-of-type",
  "left",
  "link",
  "marker",
  "modal",
  "not",
  "nth-child",
  "nth-last-child",
  "nth-last-of-type",
  "nth-of-type",
  "only-child",
  "only-of-type",
  "optional",
  "out-of-range",
  "part",
  "placeholder",
  "placeholder-shown",
  "read-only",
  "read-write",
  "required",
  "right",
  "root",
  "scope",
  "selection",
  "slotted",
  "target",
  "target-text",
  "valid",
  "visited",
  "where"
].map((n) => ({ type: "class", label: n })), ZO = /* @__PURE__ */ [
  "above",
  "absolute",
  "activeborder",
  "additive",
  "activecaption",
  "after-white-space",
  "ahead",
  "alias",
  "all",
  "all-scroll",
  "alphabetic",
  "alternate",
  "always",
  "antialiased",
  "appworkspace",
  "asterisks",
  "attr",
  "auto",
  "auto-flow",
  "avoid",
  "avoid-column",
  "avoid-page",
  "avoid-region",
  "axis-pan",
  "background",
  "backwards",
  "baseline",
  "below",
  "bidi-override",
  "blink",
  "block",
  "block-axis",
  "bold",
  "bolder",
  "border",
  "border-box",
  "both",
  "bottom",
  "break",
  "break-all",
  "break-word",
  "bullets",
  "button",
  "button-bevel",
  "buttonface",
  "buttonhighlight",
  "buttonshadow",
  "buttontext",
  "calc",
  "capitalize",
  "caps-lock-indicator",
  "caption",
  "captiontext",
  "caret",
  "cell",
  "center",
  "checkbox",
  "circle",
  "cjk-decimal",
  "clear",
  "clip",
  "close-quote",
  "col-resize",
  "collapse",
  "color",
  "color-burn",
  "color-dodge",
  "column",
  "column-reverse",
  "compact",
  "condensed",
  "contain",
  "content",
  "contents",
  "content-box",
  "context-menu",
  "continuous",
  "copy",
  "counter",
  "counters",
  "cover",
  "crop",
  "cross",
  "crosshair",
  "currentcolor",
  "cursive",
  "cyclic",
  "darken",
  "dashed",
  "decimal",
  "decimal-leading-zero",
  "default",
  "default-button",
  "dense",
  "destination-atop",
  "destination-in",
  "destination-out",
  "destination-over",
  "difference",
  "disc",
  "discard",
  "disclosure-closed",
  "disclosure-open",
  "document",
  "dot-dash",
  "dot-dot-dash",
  "dotted",
  "double",
  "down",
  "e-resize",
  "ease",
  "ease-in",
  "ease-in-out",
  "ease-out",
  "element",
  "ellipse",
  "ellipsis",
  "embed",
  "end",
  "ethiopic-abegede-gez",
  "ethiopic-halehame-aa-er",
  "ethiopic-halehame-gez",
  "ew-resize",
  "exclusion",
  "expanded",
  "extends",
  "extra-condensed",
  "extra-expanded",
  "fantasy",
  "fast",
  "fill",
  "fill-box",
  "fixed",
  "flat",
  "flex",
  "flex-end",
  "flex-start",
  "footnotes",
  "forwards",
  "from",
  "geometricPrecision",
  "graytext",
  "grid",
  "groove",
  "hand",
  "hard-light",
  "help",
  "hidden",
  "hide",
  "higher",
  "highlight",
  "highlighttext",
  "horizontal",
  "hsl",
  "hsla",
  "hue",
  "icon",
  "ignore",
  "inactiveborder",
  "inactivecaption",
  "inactivecaptiontext",
  "infinite",
  "infobackground",
  "infotext",
  "inherit",
  "initial",
  "inline",
  "inline-axis",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
  "inset",
  "inside",
  "intrinsic",
  "invert",
  "italic",
  "justify",
  "keep-all",
  "landscape",
  "large",
  "larger",
  "left",
  "level",
  "lighter",
  "lighten",
  "line-through",
  "linear",
  "linear-gradient",
  "lines",
  "list-item",
  "listbox",
  "listitem",
  "local",
  "logical",
  "loud",
  "lower",
  "lower-hexadecimal",
  "lower-latin",
  "lower-norwegian",
  "lowercase",
  "ltr",
  "luminosity",
  "manipulation",
  "match",
  "matrix",
  "matrix3d",
  "medium",
  "menu",
  "menutext",
  "message-box",
  "middle",
  "min-intrinsic",
  "mix",
  "monospace",
  "move",
  "multiple",
  "multiple_mask_images",
  "multiply",
  "n-resize",
  "narrower",
  "ne-resize",
  "nesw-resize",
  "no-close-quote",
  "no-drop",
  "no-open-quote",
  "no-repeat",
  "none",
  "normal",
  "not-allowed",
  "nowrap",
  "ns-resize",
  "numbers",
  "numeric",
  "nw-resize",
  "nwse-resize",
  "oblique",
  "opacity",
  "open-quote",
  "optimizeLegibility",
  "optimizeSpeed",
  "outset",
  "outside",
  "outside-shape",
  "overlay",
  "overline",
  "padding",
  "padding-box",
  "painted",
  "page",
  "paused",
  "perspective",
  "pinch-zoom",
  "plus-darker",
  "plus-lighter",
  "pointer",
  "polygon",
  "portrait",
  "pre",
  "pre-line",
  "pre-wrap",
  "preserve-3d",
  "progress",
  "push-button",
  "radial-gradient",
  "radio",
  "read-only",
  "read-write",
  "read-write-plaintext-only",
  "rectangle",
  "region",
  "relative",
  "repeat",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeat-x",
  "repeat-y",
  "reset",
  "reverse",
  "rgb",
  "rgba",
  "ridge",
  "right",
  "rotate",
  "rotate3d",
  "rotateX",
  "rotateY",
  "rotateZ",
  "round",
  "row",
  "row-resize",
  "row-reverse",
  "rtl",
  "run-in",
  "running",
  "s-resize",
  "sans-serif",
  "saturation",
  "scale",
  "scale3d",
  "scaleX",
  "scaleY",
  "scaleZ",
  "screen",
  "scroll",
  "scrollbar",
  "scroll-position",
  "se-resize",
  "self-start",
  "self-end",
  "semi-condensed",
  "semi-expanded",
  "separate",
  "serif",
  "show",
  "single",
  "skew",
  "skewX",
  "skewY",
  "skip-white-space",
  "slide",
  "slider-horizontal",
  "slider-vertical",
  "sliderthumb-horizontal",
  "sliderthumb-vertical",
  "slow",
  "small",
  "small-caps",
  "small-caption",
  "smaller",
  "soft-light",
  "solid",
  "source-atop",
  "source-in",
  "source-out",
  "source-over",
  "space",
  "space-around",
  "space-between",
  "space-evenly",
  "spell-out",
  "square",
  "start",
  "static",
  "status-bar",
  "stretch",
  "stroke",
  "stroke-box",
  "sub",
  "subpixel-antialiased",
  "svg_masks",
  "super",
  "sw-resize",
  "symbolic",
  "symbols",
  "system-ui",
  "table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row",
  "table-row-group",
  "text",
  "text-bottom",
  "text-top",
  "textarea",
  "textfield",
  "thick",
  "thin",
  "threeddarkshadow",
  "threedface",
  "threedhighlight",
  "threedlightshadow",
  "threedshadow",
  "to",
  "top",
  "transform",
  "translate",
  "translate3d",
  "translateX",
  "translateY",
  "translateZ",
  "transparent",
  "ultra-condensed",
  "ultra-expanded",
  "underline",
  "unidirectional-pan",
  "unset",
  "up",
  "upper-latin",
  "uppercase",
  "url",
  "var",
  "vertical",
  "vertical-text",
  "view-box",
  "visible",
  "visibleFill",
  "visiblePainted",
  "visibleStroke",
  "visual",
  "w-resize",
  "wait",
  "wave",
  "wider",
  "window",
  "windowframe",
  "windowtext",
  "words",
  "wrap",
  "wrap-reverse",
  "x-large",
  "x-small",
  "xor",
  "xx-large",
  "xx-small"
].map((n) => ({ type: "keyword", label: n })).concat(/* @__PURE__ */ [
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "grey",
  "green",
  "greenyellow",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen"
].map((n) => ({ type: "constant", label: n }))), O$ = /* @__PURE__ */ [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "hgroup",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "main",
  "meter",
  "nav",
  "ol",
  "output",
  "p",
  "pre",
  "ruby",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
].map((n) => ({ type: "type", label: n })), c$ = /* @__PURE__ */ [
  "@charset",
  "@color-profile",
  "@container",
  "@counter-style",
  "@font-face",
  "@font-feature-values",
  "@font-palette-values",
  "@import",
  "@keyframes",
  "@layer",
  "@media",
  "@namespace",
  "@page",
  "@position-try",
  "@property",
  "@scope",
  "@starting-style",
  "@supports",
  "@view-transition"
].map((n) => ({ type: "keyword", label: n })), ut = /^(\w[\w-]*|-\w[\w-]*|)$/, f$ = /^-(-[\w-]*)?$/;
function u$(n, e) {
  var t;
  if ((n.name == "(" || n.type.isError) && (n = n.parent || n), n.name != "ArgList")
    return !1;
  let i = (t = n.parent) === null || t === void 0 ? void 0 : t.firstChild;
  return i?.name != "Callee" ? !1 : e.sliceString(i.from, i.to) == "var";
}
const RO = /* @__PURE__ */ new jl(), d$ = ["Declaration"];
function p$(n) {
  for (let e = n; ; ) {
    if (e.type.isTop)
      return e;
    if (!(e = e.parent))
      return n;
  }
}
function jd(n, e, t) {
  if (e.to - e.from > 4096) {
    let i = RO.get(e);
    if (i)
      return i;
    let r = [], s = /* @__PURE__ */ new Set(), o = e.cursor(V.IncludeAnonymous);
    if (o.firstChild())
      do
        for (let l of jd(n, o.node, t))
          s.has(l.label) || (s.add(l.label), r.push(l));
      while (o.nextSibling());
    return RO.set(e, r), r;
  } else {
    let i = [], r = /* @__PURE__ */ new Set();
    return e.cursor().iterate((s) => {
      var o;
      if (t(s) && s.matchContext(d$) && ((o = s.node.nextSibling) === null || o === void 0 ? void 0 : o.name) == ":") {
        let l = n.sliceString(s.from, s.to);
        r.has(l) || (r.add(l), i.push({ label: l, type: "variable" }));
      }
    }), i;
  }
}
const m$ = (n) => (e) => {
  let { state: t, pos: i } = e, r = I(t).resolveInner(i, -1), s = r.type.isError && r.from == r.to - 1 && t.doc.sliceString(r.from, r.to) == "-";
  if (r.name == "PropertyName" || (s || r.name == "TagName") && /^(Block|Styles)$/.test(r.resolve(r.to).name))
    return { from: r.from, options: ro(), validFor: ut };
  if (r.name == "ValueName")
    return { from: r.from, options: ZO, validFor: ut };
  if (r.name == "PseudoClassName")
    return { from: r.from, options: CO, validFor: ut };
  if (n(r) || (e.explicit || s) && u$(r, t.doc))
    return {
      from: n(r) || s ? r.from : i,
      options: jd(t.doc, p$(r), n),
      validFor: f$
    };
  if (r.name == "TagName") {
    for (let { parent: a } = r; a; a = a.parent)
      if (a.name == "Block")
        return { from: r.from, options: ro(), validFor: ut };
    return { from: r.from, options: O$, validFor: ut };
  }
  if (r.name == "AtKeyword")
    return { from: r.from, options: c$, validFor: ut };
  if (!e.explicit)
    return null;
  let o = r.resolve(i), l = o.childBefore(i);
  return l && l.name == ":" && o.name == "PseudoClassSelector" ? { from: i, options: CO, validFor: ut } : l && l.name == ":" && o.name == "Declaration" || o.name == "ArgList" ? { from: i, options: ZO, validFor: ut } : o.name == "Block" || o.name == "Styles" ? { from: i, options: ro(), validFor: ut } : null;
}, g$ = /* @__PURE__ */ m$((n) => n.name == "VariableName"), Hr = /* @__PURE__ */ Et.define({
  name: "css",
  parser: /* @__PURE__ */ h$.configure({
    props: [
      /* @__PURE__ */ Bt.add({
        Declaration: /* @__PURE__ */ wi()
      }),
      /* @__PURE__ */ It.add({
        "Block KeyframeList": cs
      })
    ]
  }),
  languageData: {
    commentTokens: { block: { open: "/*", close: "*/" } },
    indentOnInput: /^\s*\}$/,
    wordChars: "-"
  }
});
function Q$() {
  return new ai(Hr, Hr.data.of({ autocomplete: g$ }));
}
const Ni = ["_blank", "_self", "_top", "_parent"], so = ["ascii", "utf-8", "utf-16", "latin1", "latin1"], oo = ["get", "post", "put", "delete"], lo = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], Ce = ["true", "false"], Z = {}, S$ = {
  a: {
    attrs: {
      href: null,
      ping: null,
      type: null,
      media: null,
      target: Ni,
      hreflang: null
    }
  },
  abbr: Z,
  address: Z,
  area: {
    attrs: {
      alt: null,
      coords: null,
      href: null,
      target: null,
      ping: null,
      media: null,
      hreflang: null,
      type: null,
      shape: ["default", "rect", "circle", "poly"]
    }
  },
  article: Z,
  aside: Z,
  audio: {
    attrs: {
      src: null,
      mediagroup: null,
      crossorigin: ["anonymous", "use-credentials"],
      preload: ["none", "metadata", "auto"],
      autoplay: ["autoplay"],
      loop: ["loop"],
      controls: ["controls"]
    }
  },
  b: Z,
  base: { attrs: { href: null, target: Ni } },
  bdi: Z,
  bdo: Z,
  blockquote: { attrs: { cite: null } },
  body: Z,
  br: Z,
  button: {
    attrs: {
      form: null,
      formaction: null,
      name: null,
      value: null,
      autofocus: ["autofocus"],
      disabled: ["autofocus"],
      formenctype: lo,
      formmethod: oo,
      formnovalidate: ["novalidate"],
      formtarget: Ni,
      type: ["submit", "reset", "button"]
    }
  },
  canvas: { attrs: { width: null, height: null } },
  caption: Z,
  center: Z,
  cite: Z,
  code: Z,
  col: { attrs: { span: null } },
  colgroup: { attrs: { span: null } },
  command: {
    attrs: {
      type: ["command", "checkbox", "radio"],
      label: null,
      icon: null,
      radiogroup: null,
      command: null,
      title: null,
      disabled: ["disabled"],
      checked: ["checked"]
    }
  },
  data: { attrs: { value: null } },
  datagrid: { attrs: { disabled: ["disabled"], multiple: ["multiple"] } },
  datalist: { attrs: { data: null } },
  dd: Z,
  del: { attrs: { cite: null, datetime: null } },
  details: { attrs: { open: ["open"] } },
  dfn: Z,
  div: Z,
  dl: Z,
  dt: Z,
  em: Z,
  embed: { attrs: { src: null, type: null, width: null, height: null } },
  eventsource: { attrs: { src: null } },
  fieldset: { attrs: { disabled: ["disabled"], form: null, name: null } },
  figcaption: Z,
  figure: Z,
  footer: Z,
  form: {
    attrs: {
      action: null,
      name: null,
      "accept-charset": so,
      autocomplete: ["on", "off"],
      enctype: lo,
      method: oo,
      novalidate: ["novalidate"],
      target: Ni
    }
  },
  h1: Z,
  h2: Z,
  h3: Z,
  h4: Z,
  h5: Z,
  h6: Z,
  head: {
    children: ["title", "base", "link", "style", "meta", "script", "noscript", "command"]
  },
  header: Z,
  hgroup: Z,
  hr: Z,
  html: {
    attrs: { manifest: null }
  },
  i: Z,
  iframe: {
    attrs: {
      src: null,
      srcdoc: null,
      name: null,
      width: null,
      height: null,
      sandbox: ["allow-top-navigation", "allow-same-origin", "allow-forms", "allow-scripts"],
      seamless: ["seamless"]
    }
  },
  img: {
    attrs: {
      alt: null,
      src: null,
      ismap: null,
      usemap: null,
      width: null,
      height: null,
      crossorigin: ["anonymous", "use-credentials"]
    }
  },
  input: {
    attrs: {
      alt: null,
      dirname: null,
      form: null,
      formaction: null,
      height: null,
      list: null,
      max: null,
      maxlength: null,
      min: null,
      name: null,
      pattern: null,
      placeholder: null,
      size: null,
      src: null,
      step: null,
      value: null,
      width: null,
      accept: ["audio/*", "video/*", "image/*"],
      autocomplete: ["on", "off"],
      autofocus: ["autofocus"],
      checked: ["checked"],
      disabled: ["disabled"],
      formenctype: lo,
      formmethod: oo,
      formnovalidate: ["novalidate"],
      formtarget: Ni,
      multiple: ["multiple"],
      readonly: ["readonly"],
      required: ["required"],
      type: [
        "hidden",
        "text",
        "search",
        "tel",
        "url",
        "email",
        "password",
        "datetime",
        "date",
        "month",
        "week",
        "time",
        "datetime-local",
        "number",
        "range",
        "color",
        "checkbox",
        "radio",
        "file",
        "submit",
        "image",
        "reset",
        "button"
      ]
    }
  },
  ins: { attrs: { cite: null, datetime: null } },
  kbd: Z,
  keygen: {
    attrs: {
      challenge: null,
      form: null,
      name: null,
      autofocus: ["autofocus"],
      disabled: ["disabled"],
      keytype: ["RSA"]
    }
  },
  label: { attrs: { for: null, form: null } },
  legend: Z,
  li: { attrs: { value: null } },
  link: {
    attrs: {
      href: null,
      type: null,
      hreflang: null,
      media: null,
      sizes: ["all", "16x16", "16x16 32x32", "16x16 32x32 64x64"]
    }
  },
  map: { attrs: { name: null } },
  mark: Z,
  menu: { attrs: { label: null, type: ["list", "context", "toolbar"] } },
  meta: {
    attrs: {
      content: null,
      charset: so,
      name: ["viewport", "application-name", "author", "description", "generator", "keywords"],
      "http-equiv": ["content-language", "content-type", "default-style", "refresh"]
    }
  },
  meter: { attrs: { value: null, min: null, low: null, high: null, max: null, optimum: null } },
  nav: Z,
  noscript: Z,
  object: {
    attrs: {
      data: null,
      type: null,
      name: null,
      usemap: null,
      form: null,
      width: null,
      height: null,
      typemustmatch: ["typemustmatch"]
    }
  },
  ol: {
    attrs: { reversed: ["reversed"], start: null, type: ["1", "a", "A", "i", "I"] },
    children: ["li", "script", "template", "ul", "ol"]
  },
  optgroup: { attrs: { disabled: ["disabled"], label: null } },
  option: { attrs: { disabled: ["disabled"], label: null, selected: ["selected"], value: null } },
  output: { attrs: { for: null, form: null, name: null } },
  p: Z,
  param: { attrs: { name: null, value: null } },
  pre: Z,
  progress: { attrs: { value: null, max: null } },
  q: { attrs: { cite: null } },
  rp: Z,
  rt: Z,
  ruby: Z,
  samp: Z,
  script: {
    attrs: {
      type: ["text/javascript"],
      src: null,
      async: ["async"],
      defer: ["defer"],
      charset: so
    }
  },
  section: Z,
  select: {
    attrs: {
      form: null,
      name: null,
      size: null,
      autofocus: ["autofocus"],
      disabled: ["disabled"],
      multiple: ["multiple"]
    }
  },
  slot: { attrs: { name: null } },
  small: Z,
  source: { attrs: { src: null, type: null, media: null } },
  span: Z,
  strong: Z,
  style: {
    attrs: {
      type: ["text/css"],
      media: null,
      scoped: null
    }
  },
  sub: Z,
  summary: Z,
  sup: Z,
  table: Z,
  tbody: Z,
  td: { attrs: { colspan: null, rowspan: null, headers: null } },
  template: Z,
  textarea: {
    attrs: {
      dirname: null,
      form: null,
      maxlength: null,
      name: null,
      placeholder: null,
      rows: null,
      cols: null,
      autofocus: ["autofocus"],
      disabled: ["disabled"],
      readonly: ["readonly"],
      required: ["required"],
      wrap: ["soft", "hard"]
    }
  },
  tfoot: Z,
  th: { attrs: { colspan: null, rowspan: null, headers: null, scope: ["row", "col", "rowgroup", "colgroup"] } },
  thead: Z,
  time: { attrs: { datetime: null } },
  title: Z,
  tr: Z,
  track: {
    attrs: {
      src: null,
      label: null,
      default: null,
      kind: ["subtitles", "captions", "descriptions", "chapters", "metadata"],
      srclang: null
    }
  },
  ul: { children: ["li", "script", "template", "ul", "ol"] },
  var: Z,
  video: {
    attrs: {
      src: null,
      poster: null,
      width: null,
      height: null,
      crossorigin: ["anonymous", "use-credentials"],
      preload: ["auto", "metadata", "none"],
      autoplay: ["autoplay"],
      mediagroup: ["movie"],
      muted: ["muted"],
      controls: ["controls"]
    }
  },
  wbr: Z
}, Wd = {
  accesskey: null,
  class: null,
  contenteditable: Ce,
  contextmenu: null,
  dir: ["ltr", "rtl", "auto"],
  draggable: ["true", "false", "auto"],
  dropzone: ["copy", "move", "link", "string:", "file:"],
  hidden: ["hidden"],
  id: null,
  inert: ["inert"],
  itemid: null,
  itemprop: null,
  itemref: null,
  itemscope: ["itemscope"],
  itemtype: null,
  lang: ["ar", "bn", "de", "en-GB", "en-US", "es", "fr", "hi", "id", "ja", "pa", "pt", "ru", "tr", "zh"],
  spellcheck: Ce,
  autocorrect: Ce,
  autocapitalize: Ce,
  style: null,
  tabindex: null,
  title: null,
  translate: ["yes", "no"],
  rel: ["stylesheet", "alternate", "author", "bookmark", "help", "license", "next", "nofollow", "noreferrer", "prefetch", "prev", "search", "tag"],
  role: /* @__PURE__ */ "alert application article banner button cell checkbox complementary contentinfo dialog document feed figure form grid gridcell heading img list listbox listitem main navigation region row rowgroup search switch tab table tabpanel textbox timer".split(" "),
  "aria-activedescendant": null,
  "aria-atomic": Ce,
  "aria-autocomplete": ["inline", "list", "both", "none"],
  "aria-busy": Ce,
  "aria-checked": ["true", "false", "mixed", "undefined"],
  "aria-controls": null,
  "aria-describedby": null,
  "aria-disabled": Ce,
  "aria-dropeffect": null,
  "aria-expanded": ["true", "false", "undefined"],
  "aria-flowto": null,
  "aria-grabbed": ["true", "false", "undefined"],
  "aria-haspopup": Ce,
  "aria-hidden": Ce,
  "aria-invalid": ["true", "false", "grammar", "spelling"],
  "aria-label": null,
  "aria-labelledby": null,
  "aria-level": null,
  "aria-live": ["off", "polite", "assertive"],
  "aria-multiline": Ce,
  "aria-multiselectable": Ce,
  "aria-owns": null,
  "aria-posinset": null,
  "aria-pressed": ["true", "false", "mixed", "undefined"],
  "aria-readonly": Ce,
  "aria-relevant": null,
  "aria-required": Ce,
  "aria-selected": ["true", "false", "undefined"],
  "aria-setsize": null,
  "aria-sort": ["ascending", "descending", "none", "other"],
  "aria-valuemax": null,
  "aria-valuemin": null,
  "aria-valuenow": null,
  "aria-valuetext": null
}, zd = /* @__PURE__ */ "beforeunload copy cut dragstart dragover dragleave dragenter dragend drag paste focus blur change click load mousedown mouseenter mouseleave mouseup keydown keyup resize scroll unload".split(" ").map((n) => "on" + n);
for (let n of zd)
  Wd[n] = null;
class vn {
  constructor(e, t) {
    this.tags = { ...S$, ...e }, this.globalAttrs = { ...Wd, ...t }, this.allTags = Object.keys(this.tags), this.globalAttrNames = Object.keys(this.globalAttrs);
  }
}
vn.default = /* @__PURE__ */ new vn();
function fi(n, e, t = n.length) {
  if (!e)
    return "";
  let i = e.firstChild, r = i && i.getChild("TagName");
  return r ? n.sliceString(r.from, Math.min(r.to, t)) : "";
}
function zi(n, e = !1) {
  for (; n; n = n.parent)
    if (n.name == "Element")
      if (e)
        e = !1;
      else
        return n;
  return null;
}
function Md(n, e, t) {
  let i = t.tags[fi(n, zi(e))];
  return i?.children || t.allTags;
}
function Oa(n, e) {
  let t = [];
  for (let i = zi(e); i && !i.type.isTop; i = zi(i.parent)) {
    let r = fi(n, i);
    if (r && i.lastChild.name == "CloseTag")
      break;
    r && t.indexOf(r) < 0 && (e.name == "EndTag" || e.from >= i.firstChild.to) && t.push(r);
  }
  return t;
}
const _d = /^[:\-\.\w\u00b7-\uffff]*$/;
function AO(n, e, t, i, r) {
  let s = /\s*>/.test(n.sliceDoc(r, r + 5)) ? "" : ">", o = zi(t, t.name == "StartTag" || t.name == "TagName");
  return {
    from: i,
    to: r,
    options: Md(n.doc, o, e).map((l) => ({ label: l, type: "type" })).concat(Oa(n.doc, t).map((l, a) => ({
      label: "/" + l,
      apply: "/" + l + s,
      type: "type",
      boost: 99 - a
    }))),
    validFor: /^\/?[:\-\.\w\u00b7-\uffff]*$/
  };
}
function qO(n, e, t, i) {
  let r = /\s*>/.test(n.sliceDoc(i, i + 5)) ? "" : ">";
  return {
    from: t,
    to: i,
    options: Oa(n.doc, e).map((s, o) => ({ label: s, apply: s + r, type: "type", boost: 99 - o })),
    validFor: _d
  };
}
function b$(n, e, t, i) {
  let r = [], s = 0;
  for (let o of Md(n.doc, t, e))
    r.push({ label: "<" + o, type: "type" });
  for (let o of Oa(n.doc, t))
    r.push({ label: "</" + o + ">", type: "type", boost: 99 - s++ });
  return { from: i, to: i, options: r, validFor: /^<\/?[:\-\.\w\u00b7-\uffff]*$/ };
}
function y$(n, e, t, i, r) {
  let s = zi(t), o = s ? e.tags[fi(n.doc, s)] : null, l = o && o.attrs ? Object.keys(o.attrs) : [], a = o && o.globalAttrs === !1 ? l : l.length ? l.concat(e.globalAttrNames) : e.globalAttrNames;
  return {
    from: i,
    to: r,
    options: a.map((h) => ({ label: h, type: "property" })),
    validFor: _d
  };
}
function k$(n, e, t, i, r) {
  var s;
  let o = (s = t.parent) === null || s === void 0 ? void 0 : s.getChild("AttributeName"), l = [], a;
  if (o) {
    let h = n.sliceDoc(o.from, o.to), O = e.globalAttrs[h];
    if (!O) {
      let c = zi(t), f = c ? e.tags[fi(n.doc, c)] : null;
      O = f?.attrs && f.attrs[h];
    }
    if (O) {
      let c = n.sliceDoc(i, r).toLowerCase(), f = '"', u = '"';
      /^['"]/.test(c) ? (a = c[0] == '"' ? /^[^"]*$/ : /^[^']*$/, f = "", u = n.sliceDoc(r, r + 1) == c[0] ? "" : c[0], c = c.slice(1), i++) : a = /^[^\s<>='"]*$/;
      for (let d of O)
        l.push({ label: d, apply: f + d + u, type: "constant" });
    }
  }
  return { from: i, to: r, options: l, validFor: a };
}
function Ed(n, e) {
  let { state: t, pos: i } = e, r = I(t).resolveInner(i, -1), s = r.resolve(i);
  for (let o = i, l; s == r && (l = r.childBefore(o)); ) {
    let a = l.lastChild;
    if (!a || !a.type.isError || a.from < a.to)
      break;
    s = r = l, o = a.from;
  }
  return r.name == "TagName" ? r.parent && /CloseTag$/.test(r.parent.name) ? qO(t, r, r.from, i) : AO(t, n, r, r.from, i) : r.name == "StartTag" || r.name == "IncompleteTag" ? AO(t, n, r, i, i) : r.name == "StartCloseTag" || r.name == "IncompleteCloseTag" ? qO(t, r, i, i) : r.name == "OpenTag" || r.name == "SelfClosingTag" || r.name == "AttributeName" ? y$(t, n, r, r.name == "AttributeName" ? r.from : i, i) : r.name == "Is" || r.name == "AttributeValue" || r.name == "UnquotedAttributeValue" ? k$(t, n, r, r.name == "Is" ? i : r.from, i) : e.explicit && (s.name == "Element" || s.name == "Text" || s.name == "Document") ? b$(t, n, r, i) : null;
}
function $$(n) {
  return Ed(vn.default, n);
}
function x$(n) {
  let { extraTags: e, extraGlobalAttributes: t } = n, i = t || e ? new vn(e, t) : vn.default;
  return (r) => Ed(i, r);
}
const P$ = /* @__PURE__ */ Ot.parser.configure({ top: "SingleExpression" }), Ld = [
  {
    tag: "script",
    attrs: (n) => n.type == "text/typescript" || n.lang == "ts",
    parser: od.parser
  },
  {
    tag: "script",
    attrs: (n) => n.type == "text/babel" || n.type == "text/jsx",
    parser: ld.parser
  },
  {
    tag: "script",
    attrs: (n) => n.type == "text/typescript-jsx",
    parser: ad.parser
  },
  {
    tag: "script",
    attrs(n) {
      return /^(importmap|speculationrules|application\/(.+\+)?json)$/i.test(n.type);
    },
    parser: P$
  },
  {
    tag: "script",
    attrs(n) {
      return !n.type || /^(?:text|application)\/(?:x-)?(?:java|ecma)script$|^module$|^$/i.test(n.type);
    },
    parser: Ot.parser
  },
  {
    tag: "style",
    attrs(n) {
      return (!n.lang || n.lang == "css") && (!n.type || /^(text\/)?(x-)?(stylesheet|css)$/i.test(n.type));
    },
    parser: Hr.parser
  }
], Yd = /* @__PURE__ */ [
  {
    name: "style",
    parser: /* @__PURE__ */ Hr.parser.configure({ top: "Styles" })
  }
].concat(/* @__PURE__ */ zd.map((n) => ({ name: n, parser: Ot.parser }))), Vd = /* @__PURE__ */ Et.define({
  name: "html",
  parser: /* @__PURE__ */ jk.configure({
    props: [
      /* @__PURE__ */ Bt.add({
        Element(n) {
          let e = /^(\s*)(<\/)?/.exec(n.textAfter);
          return n.node.to <= n.pos + e[0].length ? n.continue() : n.lineIndent(n.node.from) + (e[2] ? 0 : n.unit);
        },
        "OpenTag CloseTag SelfClosingTag"(n) {
          return n.column(n.node.from) + n.unit;
        },
        Document(n) {
          if (n.pos + /\s*/.exec(n.textAfter)[0].length < n.node.to)
            return n.continue();
          let e = null, t;
          for (let i = n.node; ; ) {
            let r = i.lastChild;
            if (!r || r.name != "Element" || r.to != i.to)
              break;
            e = i = r;
          }
          return e && !((t = e.lastChild) && (t.name == "CloseTag" || t.name == "SelfClosingTag")) ? n.lineIndent(e.from) + n.unit : null;
        }
      }),
      /* @__PURE__ */ It.add({
        Element(n) {
          let e = n.firstChild, t = n.lastChild;
          return !e || e.name != "OpenTag" ? null : { from: e.to, to: t.name == "CloseTag" ? t.from : n.to };
        }
      }),
      /* @__PURE__ */ If.add({
        "OpenTag CloseTag": (n) => n.getChild("TagName")
      })
    ]
  }),
  languageData: {
    commentTokens: { block: { open: "<!--", close: "-->" } },
    indentOnInput: /^\s*<\/\w+\W$/,
    wordChars: "-_"
  }
}), yr = /* @__PURE__ */ Vd.configure({
  wrap: /* @__PURE__ */ Cd(Ld, Yd)
});
function w$(n = {}) {
  let e = "", t;
  n.matchClosingTags === !1 && (e = "noMatch"), n.selfClosingTags === !0 && (e = (e ? e + " " : "") + "selfClosing"), (n.nestedLanguages && n.nestedLanguages.length || n.nestedAttributes && n.nestedAttributes.length) && (t = Cd((n.nestedLanguages || []).concat(Ld), (n.nestedAttributes || []).concat(Yd)));
  let i = t ? Vd.configure({ wrap: t, dialect: e }) : e ? yr.configure({ dialect: e }) : yr;
  return new ai(i, [
    yr.data.of({ autocomplete: x$(n) }),
    n.autoCloseTags !== !1 ? T$ : [],
    Cb().support,
    Q$().support
  ]);
}
const jO = /* @__PURE__ */ new Set(/* @__PURE__ */ "area base br col command embed frame hr img input keygen link meta param source track wbr menuitem".split(" "));
function v$(n, e, t) {
  for (var i; ; ) {
    if (((i = e.lastChild) === null || i === void 0 ? void 0 : i.name) != "CloseTag")
      return !1;
    let r = e.parent;
    if (!r || fi(n, r) != t)
      return !0;
    e = r;
  }
}
const T$ = /* @__PURE__ */ T.inputHandler.of((n, e, t, i, r) => {
  if (n.composing || n.state.readOnly || e != t || i != ">" && i != "/" || !yr.isActiveAt(n.state, e, -1))
    return !1;
  let s = r(), { state: o } = s, l = o.changeByRange((a) => {
    var h;
    let O = o.doc.sliceString(a.from - 1, a.to) == i, { head: c } = a, f = I(o).resolveInner(c, -1), u;
    if (O && i == ">" && f.name == "EndTag") {
      let d = f.parent;
      if ((u = fi(o.doc, d.parent, c)) && !jO.has(u) && !v$(o.doc, d.parent, u)) {
        let p = c + (o.doc.sliceString(c, c + 1) === ">" ? 1 : 0), g = `</${u}>`;
        return { range: a, changes: { from: c, to: p, insert: g } };
      }
    } else if (O && i == "/" && f.name == "IncompleteCloseTag") {
      let d = f.parent;
      if (f.from == c - 2 && ((h = d.lastChild) === null || h === void 0 ? void 0 : h.name) != "CloseTag" && (u = fi(o.doc, d, c)) && !jO.has(u)) {
        let p = c + (o.doc.sliceString(c, c + 1) === ">" ? 1 : 0), g = `${u}>`;
        return {
          range: S.cursor(c + g.length, -1),
          changes: { from: c, to: p, insert: g }
        };
      }
    }
    return { range: a };
  });
  return l.changes.empty ? !1 : (n.dispatch([
    s,
    o.update(l, {
      userEvent: "input.complete",
      scrollIntoView: !0
    })
  ]), !0);
});
class Kr {
  static create(e, t, i, r, s) {
    let o = r + (r << 8) + e + (t << 4) | 0;
    return new Kr(e, t, i, o, s, [], []);
  }
  constructor(e, t, i, r, s, o, l) {
    this.type = e, this.value = t, this.from = i, this.hash = r, this.end = s, this.children = o, this.positions = l, this.hashProp = [[q.contextHash, r]];
  }
  addChild(e, t) {
    e.prop(q.contextHash) != this.hash && (e = new z(e.type, e.children, e.positions, e.length, this.hashProp)), this.children.push(e), this.positions.push(t);
  }
  toTree(e, t = this.end) {
    let i = this.children.length - 1;
    return i >= 0 && (t = Math.max(t, this.positions[i] + this.children[i].length + this.from)), new z(e.types[this.type], this.children, this.positions, t - this.from).balance({
      makeTree: (r, s, o) => new z(se.none, r, s, o, this.hashProp)
    });
  }
}
var $;
(function(n) {
  n[n.Document = 1] = "Document", n[n.CodeBlock = 2] = "CodeBlock", n[n.FencedCode = 3] = "FencedCode", n[n.Blockquote = 4] = "Blockquote", n[n.HorizontalRule = 5] = "HorizontalRule", n[n.BulletList = 6] = "BulletList", n[n.OrderedList = 7] = "OrderedList", n[n.ListItem = 8] = "ListItem", n[n.ATXHeading1 = 9] = "ATXHeading1", n[n.ATXHeading2 = 10] = "ATXHeading2", n[n.ATXHeading3 = 11] = "ATXHeading3", n[n.ATXHeading4 = 12] = "ATXHeading4", n[n.ATXHeading5 = 13] = "ATXHeading5", n[n.ATXHeading6 = 14] = "ATXHeading6", n[n.SetextHeading1 = 15] = "SetextHeading1", n[n.SetextHeading2 = 16] = "SetextHeading2", n[n.HTMLBlock = 17] = "HTMLBlock", n[n.LinkReference = 18] = "LinkReference", n[n.Paragraph = 19] = "Paragraph", n[n.CommentBlock = 20] = "CommentBlock", n[n.ProcessingInstructionBlock = 21] = "ProcessingInstructionBlock", n[n.Escape = 22] = "Escape", n[n.Entity = 23] = "Entity", n[n.HardBreak = 24] = "HardBreak", n[n.Emphasis = 25] = "Emphasis", n[n.StrongEmphasis = 26] = "StrongEmphasis", n[n.Link = 27] = "Link", n[n.Image = 28] = "Image", n[n.InlineCode = 29] = "InlineCode", n[n.HTMLTag = 30] = "HTMLTag", n[n.Comment = 31] = "Comment", n[n.ProcessingInstruction = 32] = "ProcessingInstruction", n[n.Autolink = 33] = "Autolink", n[n.HeaderMark = 34] = "HeaderMark", n[n.QuoteMark = 35] = "QuoteMark", n[n.ListMark = 36] = "ListMark", n[n.LinkMark = 37] = "LinkMark", n[n.EmphasisMark = 38] = "EmphasisMark", n[n.CodeMark = 39] = "CodeMark", n[n.CodeText = 40] = "CodeText", n[n.CodeInfo = 41] = "CodeInfo", n[n.LinkTitle = 42] = "LinkTitle", n[n.LinkLabel = 43] = "LinkLabel", n[n.URL = 44] = "URL";
})($ || ($ = {}));
class X$ {
  /**
  @internal
  */
  constructor(e, t) {
    this.start = e, this.content = t, this.marks = [], this.parsers = [];
  }
}
class C$ {
  constructor() {
    this.text = "", this.baseIndent = 0, this.basePos = 0, this.depth = 0, this.markers = [], this.pos = 0, this.indent = 0, this.next = -1;
  }
  /**
  @internal
  */
  forward() {
    this.basePos > this.pos && this.forwardInner();
  }
  /**
  @internal
  */
  forwardInner() {
    let e = this.skipSpace(this.basePos);
    this.indent = this.countIndent(e, this.pos, this.indent), this.pos = e, this.next = e == this.text.length ? -1 : this.text.charCodeAt(e);
  }
  /**
  Skip whitespace after the given position, return the position of
  the next non-space character or the end of the line if there's
  only space after `from`.
  */
  skipSpace(e) {
    return hn(this.text, e);
  }
  /**
  @internal
  */
  reset(e) {
    for (this.text = e, this.baseIndent = this.basePos = this.pos = this.indent = 0, this.forwardInner(), this.depth = 1; this.markers.length; )
      this.markers.pop();
  }
  /**
  Move the line's base position forward to the given position.
  This should only be called by composite [block
  parsers](#BlockParser.parse) or [markup skipping
  functions](#NodeSpec.composite).
  */
  moveBase(e) {
    this.basePos = e, this.baseIndent = this.countIndent(e, this.pos, this.indent);
  }
  /**
  Move the line's base position forward to the given _column_.
  */
  moveBaseColumn(e) {
    this.baseIndent = e, this.basePos = this.findColumn(e);
  }
  /**
  Store a composite-block-level marker. Should be called from
  [markup skipping functions](#NodeSpec.composite) when they
  consume any non-whitespace characters.
  */
  addMarker(e) {
    this.markers.push(e);
  }
  /**
  Find the column position at `to`, optionally starting at a given
  position and column.
  */
  countIndent(e, t = 0, i = 0) {
    for (let r = t; r < e; r++)
      i += this.text.charCodeAt(r) == 9 ? 4 - i % 4 : 1;
    return i;
  }
  /**
  Find the position corresponding to the given column.
  */
  findColumn(e) {
    let t = 0;
    for (let i = 0; t < this.text.length && i < e; t++)
      i += this.text.charCodeAt(t) == 9 ? 4 - i % 4 : 1;
    return t;
  }
  /**
  @internal
  */
  scrub() {
    if (!this.baseIndent)
      return this.text;
    let e = "";
    for (let t = 0; t < this.basePos; t++)
      e += " ";
    return e + this.text.slice(this.basePos);
  }
}
function WO(n, e, t) {
  if (t.pos == t.text.length || n != e.block && t.indent >= e.stack[t.depth + 1].value + t.baseIndent)
    return !0;
  if (t.indent >= t.baseIndent + 4)
    return !1;
  let i = (n.type == $.OrderedList ? ua : fa)(t, e, !1);
  return i > 0 && (n.type != $.BulletList || ca(t, e, !1) < 0) && t.text.charCodeAt(t.pos + i - 1) == n.value;
}
const Ud = {
  [$.Blockquote](n, e, t) {
    return t.next != 62 ? !1 : (t.markers.push(L($.QuoteMark, e.lineStart + t.pos, e.lineStart + t.pos + 1)), t.moveBase(t.pos + (Ue(t.text.charCodeAt(t.pos + 1)) ? 2 : 1)), n.end = e.lineStart + t.text.length, !0);
  },
  [$.ListItem](n, e, t) {
    return t.indent < t.baseIndent + n.value && t.next > -1 ? !1 : (t.moveBaseColumn(t.baseIndent + n.value), !0);
  },
  [$.OrderedList]: WO,
  [$.BulletList]: WO,
  [$.Document]() {
    return !0;
  }
};
function Ue(n) {
  return n == 32 || n == 9 || n == 10 || n == 13;
}
function hn(n, e = 0) {
  for (; e < n.length && Ue(n.charCodeAt(e)); )
    e++;
  return e;
}
function zO(n, e, t) {
  for (; e > t && Ue(n.charCodeAt(e - 1)); )
    e--;
  return e;
}
function Dd(n) {
  if (n.next != 96 && n.next != 126)
    return -1;
  let e = n.pos + 1;
  for (; e < n.text.length && n.text.charCodeAt(e) == n.next; )
    e++;
  if (e < n.pos + 3)
    return -1;
  if (n.next == 96) {
    for (let t = e; t < n.text.length; t++)
      if (n.text.charCodeAt(t) == 96)
        return -1;
  }
  return e;
}
function Bd(n) {
  return n.next != 62 ? -1 : n.text.charCodeAt(n.pos + 1) == 32 ? 2 : 1;
}
function ca(n, e, t) {
  if (n.next != 42 && n.next != 45 && n.next != 95)
    return -1;
  let i = 1;
  for (let r = n.pos + 1; r < n.text.length; r++) {
    let s = n.text.charCodeAt(r);
    if (s == n.next)
      i++;
    else if (!Ue(s))
      return -1;
  }
  return t && n.next == 45 && Nd(n) > -1 && n.depth == e.stack.length && e.parser.leafBlockParsers.indexOf(Jd.SetextHeading) > -1 || i < 3 ? -1 : 1;
}
function Id(n, e) {
  for (let t = n.stack.length - 1; t >= 0; t--)
    if (n.stack[t].type == e)
      return !0;
  return !1;
}
function fa(n, e, t) {
  return (n.next == 45 || n.next == 43 || n.next == 42) && (n.pos == n.text.length - 1 || Ue(n.text.charCodeAt(n.pos + 1))) && (!t || Id(e, $.BulletList) || n.skipSpace(n.pos + 2) < n.text.length) ? 1 : -1;
}
function ua(n, e, t) {
  let i = n.pos, r = n.next;
  for (; r >= 48 && r <= 57; ) {
    i++;
    if (i == n.text.length)
      return -1;
    r = n.text.charCodeAt(i);
  }
  return i == n.pos || i > n.pos + 9 || r != 46 && r != 41 || i < n.text.length - 1 && !Ue(n.text.charCodeAt(i + 1)) || t && !Id(e, $.OrderedList) && (n.skipSpace(i + 1) == n.text.length || i > n.pos + 1 || n.next != 49) ? -1 : i + 1 - n.pos;
}
function Gd(n) {
  if (n.next != 35)
    return -1;
  let e = n.pos + 1;
  for (; e < n.text.length && n.text.charCodeAt(e) == 35; )
    e++;
  if (e < n.text.length && n.text.charCodeAt(e) != 32)
    return -1;
  let t = e - n.pos;
  return t > 6 ? -1 : t;
}
function Nd(n) {
  if (n.next != 45 && n.next != 61 || n.indent >= n.baseIndent + 4)
    return -1;
  let e = n.pos + 1;
  for (; e < n.text.length && n.text.charCodeAt(e) == n.next; )
    e++;
  let t = e;
  for (; e < n.text.length && Ue(n.text.charCodeAt(e)); )
    e++;
  return e == n.text.length ? t : -1;
}
const Ol = /^[ \t]*$/, Fd = /-->/, Hd = /\?>/, cl = [
  [/^<(?:script|pre|style)(?:\s|>|$)/i, /<\/(?:script|pre|style)>/i],
  [/^\s*<!--/, Fd],
  [/^\s*<\?/, Hd],
  [/^\s*<![A-Z]/, />/],
  [/^\s*<!\[CDATA\[/, /\]\]>/],
  [/^\s*<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i, Ol],
  [/^\s*(?:<\/[a-z][\w-]*\s*>|<[a-z][\w-]*(\s+[a-z:_][\w-.]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*>)\s*$/i, Ol]
];
function Kd(n, e, t) {
  if (n.next != 60)
    return -1;
  let i = n.text.slice(n.pos);
  for (let r = 0, s = cl.length - (t ? 1 : 0); r < s; r++)
    if (cl[r][0].test(i))
      return r;
  return -1;
}
function MO(n, e) {
  let t = n.countIndent(e, n.pos, n.indent), i = n.skipSpace(e), r = n.countIndent(i, e, t);
  return r >= t + 5 || i == n.text.length ? t + 1 : r;
}
function wt(n, e, t) {
  let i = n.length - 1;
  i >= 0 && n[i].to == e && n[i].type == $.CodeText ? n[i].to = t : n.push(L($.CodeText, e, t));
}
const lr = {
  LinkReference: void 0,
  IndentedCode(n, e) {
    let t = e.baseIndent + 4;
    if (e.indent < t)
      return !1;
    let i = e.findColumn(t), r = n.lineStart + i, s = n.lineStart + e.text.length, o = [], l = [];
    for (wt(o, r, s); n.nextLine() && e.depth >= n.stack.length; )
      if (e.pos == e.text.length) {
        wt(l, n.lineStart - 1, n.lineStart);
        for (let a of e.markers)
          l.push(a);
      } else {
        if (e.indent < t)
          break;
        {
          if (l.length) {
            for (let h of l)
              h.type == $.CodeText ? wt(o, h.from, h.to) : o.push(h);
            l = [];
          }
          wt(o, n.lineStart - 1, n.lineStart);
          for (let h of e.markers)
            o.push(h);
          s = n.lineStart + e.text.length;
          let a = n.lineStart + e.findColumn(e.baseIndent + 4);
          a < s && wt(o, a, s);
        }
      }
    return l.length && (l = l.filter((a) => a.type != $.CodeText), l.length && (e.markers = l.concat(e.markers))), n.addNode(n.buffer.writeElements(o, -r).finish($.CodeBlock, s - r), r), !0;
  },
  FencedCode(n, e) {
    let t = Dd(e);
    if (t < 0)
      return !1;
    let i = n.lineStart + e.pos, r = e.next, s = t - e.pos, o = e.skipSpace(t), l = zO(e.text, e.text.length, o), a = [L($.CodeMark, i, i + s)];
    o < l && a.push(L($.CodeInfo, n.lineStart + o, n.lineStart + l));
    for (let h = !0, O = !0, c = !1; n.nextLine() && e.depth >= n.stack.length; h = !1) {
      let f = e.pos;
      if (e.indent - e.baseIndent < 4)
        for (; f < e.text.length && e.text.charCodeAt(f) == r; )
          f++;
      if (f - e.pos >= s && e.skipSpace(f) == e.text.length) {
        for (let u of e.markers)
          a.push(u);
        O && c && wt(a, n.lineStart - 1, n.lineStart), a.push(L($.CodeMark, n.lineStart + e.pos, n.lineStart + f)), n.nextLine();
        break;
      } else {
        c = !0, h || (wt(a, n.lineStart - 1, n.lineStart), O = !1);
        for (let p of e.markers)
          a.push(p);
        let u = n.lineStart + e.basePos, d = n.lineStart + e.text.length;
        u < d && (wt(a, u, d), O = !1);
      }
    }
    return n.addNode(n.buffer.writeElements(a, -i).finish($.FencedCode, n.prevLineEnd() - i), i), !0;
  },
  Blockquote(n, e) {
    let t = Bd(e);
    return t < 0 ? !1 : (n.startContext($.Blockquote, e.pos), n.addNode($.QuoteMark, n.lineStart + e.pos, n.lineStart + e.pos + 1), e.moveBase(e.pos + t), null);
  },
  HorizontalRule(n, e) {
    if (ca(e, n, !1) < 0)
      return !1;
    let t = n.lineStart + e.pos;
    return n.nextLine(), n.addNode($.HorizontalRule, t), !0;
  },
  BulletList(n, e) {
    let t = fa(e, n, !1);
    if (t < 0)
      return !1;
    n.block.type != $.BulletList && n.startContext($.BulletList, e.basePos, e.next);
    let i = MO(e, e.pos + 1);
    return n.startContext($.ListItem, e.basePos, i - e.baseIndent), n.addNode($.ListMark, n.lineStart + e.pos, n.lineStart + e.pos + t), e.moveBaseColumn(i), null;
  },
  OrderedList(n, e) {
    let t = ua(e, n, !1);
    if (t < 0)
      return !1;
    n.block.type != $.OrderedList && n.startContext($.OrderedList, e.basePos, e.text.charCodeAt(e.pos + t - 1));
    let i = MO(e, e.pos + t);
    return n.startContext($.ListItem, e.basePos, i - e.baseIndent), n.addNode($.ListMark, n.lineStart + e.pos, n.lineStart + e.pos + t), e.moveBaseColumn(i), null;
  },
  ATXHeading(n, e) {
    let t = Gd(e);
    if (t < 0)
      return !1;
    let i = e.pos, r = n.lineStart + i, s = zO(e.text, e.text.length, i), o = s;
    for (; o > i && e.text.charCodeAt(o - 1) == e.next; )
      o--;
    (o == s || o == i || !Ue(e.text.charCodeAt(o - 1))) && (o = e.text.length);
    let l = n.buffer.write($.HeaderMark, 0, t).writeElements(n.parser.parseInline(e.text.slice(i + t + 1, o), r + t + 1), -r);
    o < e.text.length && l.write($.HeaderMark, o - i, s - i);
    let a = l.finish($.ATXHeading1 - 1 + t, e.text.length - i);
    return n.nextLine(), n.addNode(a, r), !0;
  },
  HTMLBlock(n, e) {
    let t = Kd(e, n, !1);
    if (t < 0)
      return !1;
    let i = n.lineStart + e.pos, r = cl[t][1], s = [], o = r != Ol;
    for (; !r.test(e.text) && n.nextLine(); ) {
      if (e.depth < n.stack.length) {
        o = !1;
        break;
      }
      for (let h of e.markers)
        s.push(h);
    }
    o && n.nextLine();
    let l = r == Fd ? $.CommentBlock : r == Hd ? $.ProcessingInstructionBlock : $.HTMLBlock, a = n.prevLineEnd();
    return n.addNode(n.buffer.writeElements(s, -i).finish(l, a - i), i), !0;
  },
  SetextHeading: void 0
  // Specifies relative precedence for block-continue function
};
class Z$ {
  constructor(e) {
    this.stage = 0, this.elts = [], this.pos = 0, this.start = e.start, this.advance(e.content);
  }
  nextLine(e, t, i) {
    if (this.stage == -1)
      return !1;
    let r = i.content + `
` + t.scrub(), s = this.advance(r);
    return s > -1 && s < r.length ? this.complete(e, i, s) : !1;
  }
  finish(e, t) {
    return (this.stage == 2 || this.stage == 3) && hn(t.content, this.pos) == t.content.length ? this.complete(e, t, t.content.length) : !1;
  }
  complete(e, t, i) {
    return e.addLeafElement(t, L($.LinkReference, this.start, this.start + i, this.elts)), !0;
  }
  nextStage(e) {
    return e ? (this.pos = e.to - this.start, this.elts.push(e), this.stage++, !0) : (e === !1 && (this.stage = -1), !1);
  }
  advance(e) {
    for (; ; ) {
      if (this.stage == -1)
        return -1;
      if (this.stage == 0) {
        if (!this.nextStage(ap(e, this.pos, this.start, !0)))
          return -1;
        if (e.charCodeAt(this.pos) != 58)
          return this.stage = -1;
        this.elts.push(L($.LinkMark, this.pos + this.start, this.pos + this.start + 1)), this.pos++;
      } else if (this.stage == 1) {
        if (!this.nextStage(op(e, hn(e, this.pos), this.start)))
          return -1;
      } else if (this.stage == 2) {
        let t = hn(e, this.pos), i = 0;
        if (t > this.pos) {
          let r = lp(e, t, this.start);
          if (r) {
            let s = ao(e, r.to - this.start);
            s > 0 && (this.nextStage(r), i = s);
          }
        }
        return i || (i = ao(e, this.pos)), i > 0 && i < e.length ? i : -1;
      } else
        return ao(e, this.pos);
    }
  }
}
function ao(n, e) {
  for (; e < n.length; e++) {
    let t = n.charCodeAt(e);
    if (t == 10)
      break;
    if (!Ue(t))
      return -1;
  }
  return e;
}
class R$ {
  nextLine(e, t, i) {
    let r = t.depth < e.stack.length ? -1 : Nd(t), s = t.next;
    if (r < 0)
      return !1;
    let o = L($.HeaderMark, e.lineStart + t.pos, e.lineStart + r);
    return e.nextLine(), e.addLeafElement(i, L(s == 61 ? $.SetextHeading1 : $.SetextHeading2, i.start, e.prevLineEnd(), [
      ...e.parser.parseInline(i.content, i.start),
      o
    ])), !0;
  }
  finish() {
    return !1;
  }
}
const Jd = {
  LinkReference(n, e) {
    return e.content.charCodeAt(0) == 91 ? new Z$(e) : null;
  },
  SetextHeading() {
    return new R$();
  }
}, A$ = [
  (n, e) => Gd(e) >= 0,
  (n, e) => Dd(e) >= 0,
  (n, e) => Bd(e) >= 0,
  (n, e) => fa(e, n, !0) >= 0,
  (n, e) => ua(e, n, !0) >= 0,
  (n, e) => ca(e, n, !0) >= 0,
  (n, e) => Kd(e, n, !0) >= 0
], q$ = { text: "", end: 0 };
class j$ {
  /**
  @internal
  */
  constructor(e, t, i, r) {
    this.parser = e, this.input = t, this.ranges = r, this.line = new C$(), this.atEnd = !1, this.reusePlaceholders = /* @__PURE__ */ new Map(), this.stoppedAt = null, this.rangeI = 0, this.to = r[r.length - 1].to, this.lineStart = this.absoluteLineStart = this.absoluteLineEnd = r[0].from, this.block = Kr.create($.Document, 0, this.lineStart, 0, 0), this.stack = [this.block], this.fragments = i.length ? new M$(i, t) : null, this.readLine();
  }
  get parsedPos() {
    return this.absoluteLineStart;
  }
  advance() {
    if (this.stoppedAt != null && this.absoluteLineStart > this.stoppedAt)
      return this.finish();
    let { line: e } = this;
    for (; ; ) {
      for (let i = 0; ; ) {
        let r = e.depth < this.stack.length ? this.stack[this.stack.length - 1] : null;
        for (; i < e.markers.length && (!r || e.markers[i].from < r.end); ) {
          let s = e.markers[i++];
          this.addNode(s.type, s.from, s.to);
        }
        if (!r)
          break;
        this.finishContext();
      }
      if (e.pos < e.text.length)
        break;
      if (!this.nextLine())
        return this.finish();
    }
    if (this.fragments && this.reuseFragment(e.basePos))
      return null;
    e: for (; ; ) {
      for (let i of this.parser.blockParsers)
        if (i) {
          let r = i(this, e);
          if (r != !1) {
            if (r == !0)
              return null;
            e.forward();
            continue e;
          }
        }
      break;
    }
    if (e.pos == e.text.length)
      return this.nextLine() ? null : this.finish();
    let t = new X$(this.lineStart + e.pos, e.text.slice(e.pos));
    for (let i of this.parser.leafBlockParsers)
      if (i) {
        let r = i(this, t);
        r && t.parsers.push(r);
      }
    e: for (; this.nextLine() && e.pos != e.text.length; ) {
      if (e.indent < e.baseIndent + 4) {
        for (let i of this.parser.endLeafBlock)
          if (i(this, e, t))
            break e;
      }
      for (let i of t.parsers)
        if (i.nextLine(this, e, t))
          return null;
      t.content += `
` + e.scrub();
      for (let i of e.markers)
        t.marks.push(i);
    }
    return this.finishLeaf(t), null;
  }
  stopAt(e) {
    if (this.stoppedAt != null && this.stoppedAt < e)
      throw new RangeError("Can't move stoppedAt forward");
    this.stoppedAt = e;
  }
  reuseFragment(e) {
    if (!this.fragments.moveTo(this.absoluteLineStart + e, this.absoluteLineStart) || !this.fragments.matches(this.block.hash))
      return !1;
    let t = this.fragments.takeNodes(this);
    return t ? (this.absoluteLineStart += t, this.lineStart = hp(this.absoluteLineStart, this.ranges), this.moveRangeI(), this.absoluteLineStart < this.to ? (this.lineStart++, this.absoluteLineStart++, this.readLine()) : (this.atEnd = !0, this.readLine()), !0) : !1;
  }
  /**
  The number of parent blocks surrounding the current block.
  */
  get depth() {
    return this.stack.length;
  }
  /**
  Get the type of the parent block at the given depth. When no
  depth is passed, return the type of the innermost parent.
  */
  parentType(e = this.depth - 1) {
    return this.parser.nodeSet.types[this.stack[e].type];
  }
  /**
  Move to the next input line. This should only be called by
  (non-composite) [block parsers](#BlockParser.parse) that consume
  the line directly, or leaf block parser
  [`nextLine`](#LeafBlockParser.nextLine) methods when they
  consume the current line (and return true).
  */
  nextLine() {
    return this.lineStart += this.line.text.length, this.absoluteLineEnd >= this.to ? (this.absoluteLineStart = this.absoluteLineEnd, this.atEnd = !0, this.readLine(), !1) : (this.lineStart++, this.absoluteLineStart = this.absoluteLineEnd + 1, this.moveRangeI(), this.readLine(), !0);
  }
  /**
  Retrieve the text of the line after the current one, without
  actually moving the context's current line forward.
  */
  peekLine() {
    return this.scanLine(this.absoluteLineEnd + 1).text;
  }
  moveRangeI() {
    for (; this.rangeI < this.ranges.length - 1 && this.absoluteLineStart >= this.ranges[this.rangeI].to; )
      this.rangeI++, this.absoluteLineStart = Math.max(this.absoluteLineStart, this.ranges[this.rangeI].from);
  }
  /**
  @internal
  Collect the text for the next line.
  */
  scanLine(e) {
    let t = q$;
    if (t.end = e, e >= this.to)
      t.text = "";
    else if (t.text = this.lineChunkAt(e), t.end += t.text.length, this.ranges.length > 1) {
      let i = this.absoluteLineStart, r = this.rangeI;
      for (; this.ranges[r].to < t.end; ) {
        r++;
        let s = this.ranges[r].from, o = this.lineChunkAt(s);
        t.end = s + o.length, t.text = t.text.slice(0, this.ranges[r - 1].to - i) + o, i = t.end - t.text.length;
      }
    }
    return t;
  }
  /**
  @internal
  Populate this.line with the content of the next line. Skip
  leading characters covered by composite blocks.
  */
  readLine() {
    let { line: e } = this, { text: t, end: i } = this.scanLine(this.absoluteLineStart);
    for (this.absoluteLineEnd = i, e.reset(t); e.depth < this.stack.length; e.depth++) {
      let r = this.stack[e.depth], s = this.parser.skipContextMarkup[r.type];
      if (!s)
        throw new Error("Unhandled block context " + $[r.type]);
      let o = this.line.markers.length;
      if (!s(r, this, e)) {
        this.line.markers.length > o && (r.end = this.line.markers[this.line.markers.length - 1].to), e.forward();
        break;
      }
      e.forward();
    }
  }
  lineChunkAt(e) {
    let t = this.input.chunk(e), i;
    if (this.input.lineChunks)
      i = t == `
` ? "" : t;
    else {
      let r = t.indexOf(`
`);
      i = r < 0 ? t : t.slice(0, r);
    }
    return e + i.length > this.to ? i.slice(0, this.to - e) : i;
  }
  /**
  The end position of the previous line.
  */
  prevLineEnd() {
    return this.atEnd ? this.lineStart : this.lineStart - 1;
  }
  /**
  @internal
  */
  startContext(e, t, i = 0) {
    this.block = Kr.create(e, i, this.lineStart + t, this.block.hash, this.lineStart + this.line.text.length), this.stack.push(this.block);
  }
  /**
  Start a composite block. Should only be called from [block
  parser functions](#BlockParser.parse) that return null.
  */
  startComposite(e, t, i = 0) {
    this.startContext(this.parser.getNodeType(e), t, i);
  }
  /**
  @internal
  */
  addNode(e, t, i) {
    typeof e == "number" && (e = new z(this.parser.nodeSet.types[e], Mi, Mi, (i ?? this.prevLineEnd()) - t)), this.block.addChild(e, t - this.block.from);
  }
  /**
  Add a block element. Can be called by [block
  parsers](#BlockParser.parse).
  */
  addElement(e) {
    this.block.addChild(e.toTree(this.parser.nodeSet), e.from - this.block.from);
  }
  /**
  Add a block element from a [leaf parser](#LeafBlockParser). This
  makes sure any extra composite block markup (such as blockquote
  markers) inside the block are also added to the syntax tree.
  */
  addLeafElement(e, t) {
    this.addNode(this.buffer.writeElements(ul(t.children, e.marks), -t.from).finish(t.type, t.to - t.from), t.from);
  }
  /**
  @internal
  */
  finishContext() {
    let e = this.stack.pop(), t = this.stack[this.stack.length - 1];
    t.addChild(e.toTree(this.parser.nodeSet), e.from - t.from), this.block = t;
  }
  finish() {
    for (; this.stack.length > 1; )
      this.finishContext();
    return this.addGaps(this.block.toTree(this.parser.nodeSet, this.lineStart));
  }
  addGaps(e) {
    return this.ranges.length > 1 ? ep(this.ranges, 0, e.topNode, this.ranges[0].from, this.reusePlaceholders) : e;
  }
  /**
  @internal
  */
  finishLeaf(e) {
    for (let i of e.parsers)
      if (i.finish(this, e))
        return;
    let t = ul(this.parser.parseInline(e.content, e.start), e.marks);
    this.addNode(this.buffer.writeElements(t, -e.start).finish($.Paragraph, e.content.length), e.start);
  }
  elt(e, t, i, r) {
    return typeof e == "string" ? L(this.parser.getNodeType(e), t, i, r) : new np(e, t);
  }
  /**
  @internal
  */
  get buffer() {
    return new ip(this.parser.nodeSet);
  }
}
function ep(n, e, t, i, r) {
  let s = n[e].to, o = [], l = [], a = t.from + i;
  function h(O, c) {
    for (; c ? O >= s : O > s; ) {
      let f = n[e + 1].from - s;
      i += f, O += f, e++, s = n[e].to;
    }
  }
  for (let O = t.firstChild; O; O = O.nextSibling) {
    h(O.from + i, !0);
    let c = O.from + i, f, u = r.get(O.tree);
    u ? f = u : O.to + i > s ? (f = ep(n, e, O, i, r), h(O.to + i, !1)) : f = O.toTree(), o.push(f), l.push(c - a);
  }
  return h(t.to + i, !1), new z(t.type, o, l, t.to + i - a, t.tree ? t.tree.propValues : void 0);
}
class bs extends as {
  /**
  @internal
  */
  constructor(e, t, i, r, s, o, l, a, h) {
    super(), this.nodeSet = e, this.blockParsers = t, this.leafBlockParsers = i, this.blockNames = r, this.endLeafBlock = s, this.skipContextMarkup = o, this.inlineParsers = l, this.inlineNames = a, this.wrappers = h, this.nodeTypes = /* @__PURE__ */ Object.create(null);
    for (let O of e.types)
      this.nodeTypes[O.name] = O.id;
  }
  createParse(e, t, i) {
    let r = new j$(this, e, t, i);
    for (let s of this.wrappers)
      r = s(r, e, t, i);
    return r;
  }
  /**
  Reconfigure the parser.
  */
  configure(e) {
    let t = fl(e);
    if (!t)
      return this;
    let { nodeSet: i, skipContextMarkup: r } = this, s = this.blockParsers.slice(), o = this.leafBlockParsers.slice(), l = this.blockNames.slice(), a = this.inlineParsers.slice(), h = this.inlineNames.slice(), O = this.endLeafBlock.slice(), c = this.wrappers;
    if (Fi(t.defineNodes)) {
      r = Object.assign({}, r);
      let f = i.types.slice(), u;
      for (let d of t.defineNodes) {
        let { name: p, block: g, composite: Q, style: b } = typeof d == "string" ? { name: d } : d;
        if (f.some((k) => k.name == p))
          continue;
        Q && (r[f.length] = (k, x, P) => Q(x, P, k.value));
        let y = f.length, C = Q ? ["Block", "BlockContext"] : g ? y >= $.ATXHeading1 && y <= $.SetextHeading2 ? ["Block", "LeafBlock", "Heading"] : ["Block", "LeafBlock"] : void 0;
        f.push(se.define({
          id: y,
          name: p,
          props: C && [[q.group, C]]
        })), b && (u || (u = {}), Array.isArray(b) || b instanceof qe ? u[p] = b : Object.assign(u, b));
      }
      i = new _i(f), u && (i = i.extend(Dt(u)));
    }
    if (Fi(t.props) && (i = i.extend(...t.props)), Fi(t.remove))
      for (let f of t.remove) {
        let u = this.blockNames.indexOf(f), d = this.inlineNames.indexOf(f);
        u > -1 && (s[u] = o[u] = void 0), d > -1 && (a[d] = void 0);
      }
    if (Fi(t.parseBlock))
      for (let f of t.parseBlock) {
        let u = l.indexOf(f.name);
        if (u > -1)
          s[u] = f.parse, o[u] = f.leaf;
        else {
          let d = f.before ? ar(l, f.before) : f.after ? ar(l, f.after) + 1 : l.length - 1;
          s.splice(d, 0, f.parse), o.splice(d, 0, f.leaf), l.splice(d, 0, f.name);
        }
        f.endLeaf && O.push(f.endLeaf);
      }
    if (Fi(t.parseInline))
      for (let f of t.parseInline) {
        let u = h.indexOf(f.name);
        if (u > -1)
          a[u] = f.parse;
        else {
          let d = f.before ? ar(h, f.before) : f.after ? ar(h, f.after) + 1 : h.length - 1;
          a.splice(d, 0, f.parse), h.splice(d, 0, f.name);
        }
      }
    return t.wrap && (c = c.concat(t.wrap)), new bs(i, s, o, l, O, r, a, h, c);
  }
  /**
  @internal
  */
  getNodeType(e) {
    let t = this.nodeTypes[e];
    if (t == null)
      throw new RangeError(`Unknown node type '${e}'`);
    return t;
  }
  /**
  Parse the given piece of inline text at the given offset,
  returning an array of [`Element`](#Element) objects representing
  the inline content.
  */
  parseInline(e, t) {
    let i = new da(this, e, t);
    e: for (let r = t; r < i.end; ) {
      let s = i.char(r);
      for (let o of this.inlineParsers)
        if (o) {
          let l = o(i, s, r);
          if (l >= 0) {
            r = l;
            continue e;
          }
        }
      r++;
    }
    return i.resolveMarkers(0);
  }
}
function Fi(n) {
  return n != null && n.length > 0;
}
function fl(n) {
  if (!Array.isArray(n))
    return n;
  if (n.length == 0)
    return null;
  let e = fl(n[0]);
  if (n.length == 1)
    return e;
  let t = fl(n.slice(1));
  if (!t || !e)
    return e || t;
  let i = (o, l) => (o || Mi).concat(l || Mi), r = e.wrap, s = t.wrap;
  return {
    props: i(e.props, t.props),
    defineNodes: i(e.defineNodes, t.defineNodes),
    parseBlock: i(e.parseBlock, t.parseBlock),
    parseInline: i(e.parseInline, t.parseInline),
    remove: i(e.remove, t.remove),
    wrap: r ? s ? (o, l, a, h) => r(s(o, l, a, h), l, a, h) : r : s
  };
}
function ar(n, e) {
  let t = n.indexOf(e);
  if (t < 0)
    throw new RangeError(`Position specified relative to unknown parser ${e}`);
  return t;
}
let tp = [se.none];
for (let n = 1, e; e = $[n]; n++)
  tp[n] = se.define({
    id: n,
    name: e,
    props: n >= $.Escape ? [] : [[q.group, n in Ud ? ["Block", "BlockContext"] : ["Block", "LeafBlock"]]],
    top: e == "Document"
  });
const Mi = [];
class ip {
  constructor(e) {
    this.nodeSet = e, this.content = [], this.nodes = [];
  }
  write(e, t, i, r = 0) {
    return this.content.push(e, t, i, 4 + r * 4), this;
  }
  writeElements(e, t = 0) {
    for (let i of e)
      i.writeTo(this, t);
    return this;
  }
  finish(e, t) {
    return z.build({
      buffer: this.content,
      nodeSet: this.nodeSet,
      reused: this.nodes,
      topID: e,
      length: t
    });
  }
}
class Tn {
  /**
  @internal
  */
  constructor(e, t, i, r = Mi) {
    this.type = e, this.from = t, this.to = i, this.children = r;
  }
  /**
  @internal
  */
  writeTo(e, t) {
    let i = e.content.length;
    e.writeElements(this.children, t), e.content.push(this.type, this.from + t, this.to + t, e.content.length + 4 - i);
  }
  /**
  @internal
  */
  toTree(e) {
    return new ip(e).writeElements(this.children, -this.from).finish(this.type, this.to - this.from);
  }
}
class np {
  constructor(e, t) {
    this.tree = e, this.from = t;
  }
  get to() {
    return this.from + this.tree.length;
  }
  get type() {
    return this.tree.type.id;
  }
  get children() {
    return Mi;
  }
  writeTo(e, t) {
    e.nodes.push(this.tree), e.content.push(e.nodes.length - 1, this.from + t, this.to + t, -1);
  }
  toTree() {
    return this.tree;
  }
}
function L(n, e, t, i) {
  return new Tn(n, e, t, i);
}
const rp = { resolve: "Emphasis", mark: "EmphasisMark" }, sp = { resolve: "Emphasis", mark: "EmphasisMark" }, Jt = {}, Jr = {};
class Re {
  constructor(e, t, i, r) {
    this.type = e, this.from = t, this.to = i, this.side = r;
  }
}
const _O = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
let Xn = /[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~\xA1\u2010-\u2027]/;
try {
  Xn = new RegExp("[\\p{S}|\\p{P}]", "u");
} catch {
}
const ho = {
  Escape(n, e, t) {
    if (e != 92 || t == n.end - 1)
      return -1;
    let i = n.char(t + 1);
    for (let r = 0; r < _O.length; r++)
      if (_O.charCodeAt(r) == i)
        return n.append(L($.Escape, t, t + 2));
    return -1;
  },
  Entity(n, e, t) {
    if (e != 38)
      return -1;
    let i = /^(?:#\d+|#x[a-f\d]+|\w+);/i.exec(n.slice(t + 1, t + 31));
    return i ? n.append(L($.Entity, t, t + 1 + i[0].length)) : -1;
  },
  InlineCode(n, e, t) {
    if (e != 96 || t && n.char(t - 1) == 96)
      return -1;
    let i = t + 1;
    for (; i < n.end && n.char(i) == 96; )
      i++;
    let r = i - t, s = 0;
    for (; i < n.end; i++)
      if (n.char(i) == 96) {
        if (s++, s == r && n.char(i + 1) != 96)
          return n.append(L($.InlineCode, t, i + 1, [
            L($.CodeMark, t, t + r),
            L($.CodeMark, i + 1 - r, i + 1)
          ]));
      } else
        s = 0;
    return -1;
  },
  HTMLTag(n, e, t) {
    if (e != 60 || t == n.end - 1)
      return -1;
    let i = n.slice(t + 1, n.end), r = /^(?:[a-z][-\w+.]+:[^\s>]+|[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*)>/i.exec(i);
    if (r)
      return n.append(L($.Autolink, t, t + 1 + r[0].length, [
        L($.LinkMark, t, t + 1),
        // url[0] includes the closing bracket, so exclude it from this slice
        L($.URL, t + 1, t + r[0].length),
        L($.LinkMark, t + r[0].length, t + 1 + r[0].length)
      ]));
    let s = /^!--[^>](?:-[^-]|[^-])*?-->/i.exec(i);
    if (s)
      return n.append(L($.Comment, t, t + 1 + s[0].length));
    let o = /^\?[^]*?\?>/.exec(i);
    if (o)
      return n.append(L($.ProcessingInstruction, t, t + 1 + o[0].length));
    let l = /^(?:![A-Z][^]*?>|!\[CDATA\[[^]*?\]\]>|\/\s*[a-zA-Z][\w-]*\s*>|\s*[a-zA-Z][\w-]*(\s+[a-zA-Z:_][\w-.:]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*(\/\s*)?>)/.exec(i);
    return l ? n.append(L($.HTMLTag, t, t + 1 + l[0].length)) : -1;
  },
  Emphasis(n, e, t) {
    if (e != 95 && e != 42)
      return -1;
    let i = t + 1;
    for (; n.char(i) == e; )
      i++;
    let r = n.slice(t - 1, t), s = n.slice(i, i + 1), o = Xn.test(r), l = Xn.test(s), a = /\s|^$/.test(r), h = /\s|^$/.test(s), O = !h && (!l || a || o), c = !a && (!o || h || l), f = O && (e == 42 || !c || o), u = c && (e == 42 || !O || l);
    return n.append(new Re(e == 95 ? rp : sp, t, i, (f ? 1 : 0) | (u ? 2 : 0)));
  },
  HardBreak(n, e, t) {
    if (e == 92 && n.char(t + 1) == 10)
      return n.append(L($.HardBreak, t, t + 2));
    if (e == 32) {
      let i = t + 1;
      for (; n.char(i) == 32; )
        i++;
      if (n.char(i) == 10 && i >= t + 2)
        return n.append(L($.HardBreak, t, i + 1));
    }
    return -1;
  },
  Link(n, e, t) {
    return e == 91 ? n.append(new Re(
      Jt,
      t,
      t + 1,
      1
      /* Mark.Open */
    )) : -1;
  },
  Image(n, e, t) {
    return e == 33 && n.char(t + 1) == 91 ? n.append(new Re(
      Jr,
      t,
      t + 2,
      1
      /* Mark.Open */
    )) : -1;
  },
  LinkEnd(n, e, t) {
    if (e != 93)
      return -1;
    for (let i = n.parts.length - 1; i >= 0; i--) {
      let r = n.parts[i];
      if (r instanceof Re && (r.type == Jt || r.type == Jr)) {
        if (!r.side || n.skipSpace(r.to) == t && !/[(\[]/.test(n.slice(t + 1, t + 2)))
          return n.parts[i] = null, -1;
        let s = n.takeContent(i), o = n.parts[i] = W$(n, s, r.type == Jt ? $.Link : $.Image, r.from, t + 1);
        if (r.type == Jt)
          for (let l = 0; l < i; l++) {
            let a = n.parts[l];
            a instanceof Re && a.type == Jt && (a.side = 0);
          }
        return o.to;
      }
    }
    return -1;
  }
};
function W$(n, e, t, i, r) {
  let { text: s } = n, o = n.char(r), l = r;
  if (e.unshift(L($.LinkMark, i, i + (t == $.Image ? 2 : 1))), e.push(L($.LinkMark, r - 1, r)), o == 40) {
    let a = n.skipSpace(r + 1), h = op(s, a - n.offset, n.offset), O;
    h && (a = n.skipSpace(h.to), a != h.to && (O = lp(s, a - n.offset, n.offset), O && (a = n.skipSpace(O.to)))), n.char(a) == 41 && (e.push(L($.LinkMark, r, r + 1)), l = a + 1, h && e.push(h), O && e.push(O), e.push(L($.LinkMark, a, l)));
  } else if (o == 91) {
    let a = ap(s, r - n.offset, n.offset, !1);
    a && (e.push(a), l = a.to);
  }
  return L(t, i, l, e);
}
function op(n, e, t) {
  if (n.charCodeAt(e) == 60) {
    for (let r = e + 1; r < n.length; r++) {
      let s = n.charCodeAt(r);
      if (s == 62)
        return L($.URL, e + t, r + 1 + t);
      if (s == 60 || s == 10)
        return !1;
    }
    return null;
  } else {
    let r = 0, s = e;
    for (let o = !1; s < n.length; s++) {
      let l = n.charCodeAt(s);
      if (Ue(l))
        break;
      if (o)
        o = !1;
      else if (l == 40)
        r++;
      else if (l == 41) {
        if (!r)
          break;
        r--;
      } else l == 92 && (o = !0);
    }
    return s > e ? L($.URL, e + t, s + t) : s == n.length ? null : !1;
  }
}
function lp(n, e, t) {
  let i = n.charCodeAt(e);
  if (i != 39 && i != 34 && i != 40)
    return !1;
  let r = i == 40 ? 41 : i;
  for (let s = e + 1, o = !1; s < n.length; s++) {
    let l = n.charCodeAt(s);
    if (o)
      o = !1;
    else {
      if (l == r)
        return L($.LinkTitle, e + t, s + 1 + t);
      l == 92 && (o = !0);
    }
  }
  return null;
}
function ap(n, e, t, i) {
  for (let r = !1, s = e + 1, o = Math.min(n.length, s + 999); s < o; s++) {
    let l = n.charCodeAt(s);
    if (r)
      r = !1;
    else {
      if (l == 93)
        return i ? !1 : L($.LinkLabel, e + t, s + 1 + t);
      if (i && !Ue(l) && (i = !1), l == 91)
        return !1;
      l == 92 && (r = !0);
    }
  }
  return null;
}
class da {
  /**
  @internal
  */
  constructor(e, t, i) {
    this.parser = e, this.text = t, this.offset = i, this.parts = [];
  }
  /**
  Get the character code at the given (document-relative)
  position.
  */
  char(e) {
    return e >= this.end ? -1 : this.text.charCodeAt(e - this.offset);
  }
  /**
  The position of the end of this inline section.
  */
  get end() {
    return this.offset + this.text.length;
  }
  /**
  Get a substring of this inline section. Again uses
  document-relative positions.
  */
  slice(e, t) {
    return this.text.slice(e - this.offset, t - this.offset);
  }
  /**
  @internal
  */
  append(e) {
    return this.parts.push(e), e.to;
  }
  /**
  Add a [delimiter](#DelimiterType) at this given position. `open`
  and `close` indicate whether this delimiter is opening, closing,
  or both. Returns the end of the delimiter, for convenient
  returning from [parse functions](#InlineParser.parse).
  */
  addDelimiter(e, t, i, r, s) {
    return this.append(new Re(e, t, i, (r ? 1 : 0) | (s ? 2 : 0)));
  }
  /**
  Returns true when there is an unmatched link or image opening
  token before the current position.
  */
  get hasOpenLink() {
    for (let e = this.parts.length - 1; e >= 0; e--) {
      let t = this.parts[e];
      if (t instanceof Re && (t.type == Jt || t.type == Jr))
        return !0;
    }
    return !1;
  }
  /**
  Add an inline element. Returns the end of the element.
  */
  addElement(e) {
    return this.append(e);
  }
  /**
  Resolve markers between this.parts.length and from, wrapping matched markers in the
  appropriate node and updating the content of this.parts. @internal
  */
  resolveMarkers(e) {
    for (let i = e; i < this.parts.length; i++) {
      let r = this.parts[i];
      if (!(r instanceof Re && r.type.resolve && r.side & 2))
        continue;
      let s = r.type == rp || r.type == sp, o = r.to - r.from, l, a = i - 1;
      for (; a >= e; a--) {
        let p = this.parts[a];
        if (p instanceof Re && p.side & 1 && p.type == r.type && // Ignore emphasis delimiters where the character count doesn't match
        !(s && (r.side & 1 || p.side & 2) && (p.to - p.from + o) % 3 == 0 && ((p.to - p.from) % 3 || o % 3))) {
          l = p;
          break;
        }
      }
      if (!l)
        continue;
      let h = r.type.resolve, O = [], c = l.from, f = r.to;
      if (s) {
        let p = Math.min(2, l.to - l.from, o);
        c = l.to - p, f = r.from + p, h = p == 1 ? "Emphasis" : "StrongEmphasis";
      }
      l.type.mark && O.push(this.elt(l.type.mark, c, l.to));
      for (let p = a + 1; p < i; p++)
        this.parts[p] instanceof Tn && O.push(this.parts[p]), this.parts[p] = null;
      r.type.mark && O.push(this.elt(r.type.mark, r.from, f));
      let u = this.elt(h, c, f, O);
      this.parts[a] = s && l.from != c ? new Re(l.type, l.from, c, l.side) : null, (this.parts[i] = s && r.to != f ? new Re(r.type, f, r.to, r.side) : null) ? this.parts.splice(i, 0, u) : this.parts[i] = u;
    }
    let t = [];
    for (let i = e; i < this.parts.length; i++) {
      let r = this.parts[i];
      r instanceof Tn && t.push(r);
    }
    return t;
  }
  /**
  Find an opening delimiter of the given type. Returns `null` if
  no delimiter is found, or an index that can be passed to
  [`takeContent`](#InlineContext.takeContent) otherwise.
  */
  findOpeningDelimiter(e) {
    for (let t = this.parts.length - 1; t >= 0; t--) {
      let i = this.parts[t];
      if (i instanceof Re && i.type == e && i.side & 1)
        return t;
    }
    return null;
  }
  /**
  Remove all inline elements and delimiters starting from the
  given index (which you should get from
  [`findOpeningDelimiter`](#InlineContext.findOpeningDelimiter),
  resolve delimiters inside of them, and return them as an array
  of elements.
  */
  takeContent(e) {
    let t = this.resolveMarkers(e);
    return this.parts.length = e, t;
  }
  /**
  Return the delimiter at the given index. Mostly useful to get
  additional info out of a delimiter index returned by
  [`findOpeningDelimiter`](#InlineContext.findOpeningDelimiter).
  Returns null if there is no delimiter at this index.
  */
  getDelimiterAt(e) {
    let t = this.parts[e];
    return t instanceof Re ? t : null;
  }
  /**
  Skip space after the given (document) position, returning either
  the position of the next non-space character or the end of the
  section.
  */
  skipSpace(e) {
    return hn(this.text, e - this.offset) + this.offset;
  }
  elt(e, t, i, r) {
    return typeof e == "string" ? L(this.parser.getNodeType(e), t, i, r) : new np(e, t);
  }
}
da.linkStart = Jt;
da.imageStart = Jr;
function ul(n, e) {
  if (!e.length)
    return n;
  if (!n.length)
    return e;
  let t = n.slice(), i = 0;
  for (let r of e) {
    for (; i < t.length && t[i].to < r.to; )
      i++;
    if (i < t.length && t[i].from < r.from) {
      let s = t[i];
      s instanceof Tn && (t[i] = new Tn(s.type, s.from, s.to, ul(s.children, [r])));
    } else
      t.splice(i++, 0, r);
  }
  return t;
}
const z$ = [$.CodeBlock, $.ListItem, $.OrderedList, $.BulletList];
class M$ {
  constructor(e, t) {
    this.fragments = e, this.input = t, this.i = 0, this.fragment = null, this.fragmentEnd = -1, this.cursor = null, e.length && (this.fragment = e[this.i++]);
  }
  nextFragment() {
    this.fragment = this.i < this.fragments.length ? this.fragments[this.i++] : null, this.cursor = null, this.fragmentEnd = -1;
  }
  moveTo(e, t) {
    for (; this.fragment && this.fragment.to <= e; )
      this.nextFragment();
    if (!this.fragment || this.fragment.from > (e ? e - 1 : 0))
      return !1;
    if (this.fragmentEnd < 0) {
      let s = this.fragment.to;
      for (; s > 0 && this.input.read(s - 1, s) != `
`; )
        s--;
      this.fragmentEnd = s ? s - 1 : 0;
    }
    let i = this.cursor;
    i || (i = this.cursor = this.fragment.tree.cursor(), i.firstChild());
    let r = e + this.fragment.offset;
    for (; i.to <= r; )
      if (!i.parent())
        return !1;
    for (; ; ) {
      if (i.from >= r)
        return this.fragment.from <= t;
      if (!i.childAfter(r))
        return !1;
    }
  }
  matches(e) {
    let t = this.cursor.tree;
    return t && t.prop(q.contextHash) == e;
  }
  takeNodes(e) {
    let t = this.cursor, i = this.fragment.offset, r = this.fragmentEnd - (this.fragment.openEnd ? 1 : 0), s = e.absoluteLineStart, o = s, l = e.block.children.length, a = o, h = l;
    for (; ; ) {
      if (t.to - i > r) {
        if (t.type.isAnonymous && t.firstChild())
          continue;
        break;
      }
      let O = hp(t.from - i, e.ranges);
      if (t.to - i <= e.ranges[e.rangeI].to)
        e.addNode(t.tree, O);
      else {
        let c = new z(e.parser.nodeSet.types[$.Paragraph], [], [], 0, e.block.hashProp);
        e.reusePlaceholders.set(c, t.tree), e.addNode(c, O);
      }
      if (t.type.is("Block") && (z$.indexOf(t.type.id) < 0 ? (o = t.to - i, l = e.block.children.length) : (o = a, l = h), a = t.to - i, h = e.block.children.length), !t.nextSibling())
        break;
    }
    for (; e.block.children.length > l; )
      e.block.children.pop(), e.block.positions.pop();
    return o - s;
  }
}
function hp(n, e) {
  let t = n;
  for (let i = 1; i < e.length; i++) {
    let r = e[i - 1].to, s = e[i].from;
    r < n && (t -= s - r);
  }
  return t;
}
const _$ = Dt({
  "Blockquote/...": m.quote,
  HorizontalRule: m.contentSeparator,
  "ATXHeading1/... SetextHeading1/...": m.heading1,
  "ATXHeading2/... SetextHeading2/...": m.heading2,
  "ATXHeading3/...": m.heading3,
  "ATXHeading4/...": m.heading4,
  "ATXHeading5/...": m.heading5,
  "ATXHeading6/...": m.heading6,
  "Comment CommentBlock": m.comment,
  Escape: m.escape,
  Entity: m.character,
  "Emphasis/...": m.emphasis,
  "StrongEmphasis/...": m.strong,
  "Link/... Image/...": m.link,
  "OrderedList/... BulletList/...": m.list,
  "BlockQuote/...": m.quote,
  "InlineCode CodeText": m.monospace,
  "URL Autolink": m.url,
  "HeaderMark HardBreak QuoteMark ListMark LinkMark EmphasisMark CodeMark": m.processingInstruction,
  "CodeInfo LinkLabel": m.labelName,
  LinkTitle: m.string,
  Paragraph: m.content
}), E$ = new bs(new _i(tp).extend(_$), Object.keys(lr).map((n) => lr[n]), Object.keys(lr).map((n) => Jd[n]), Object.keys(lr), A$, Ud, Object.keys(ho).map((n) => ho[n]), Object.keys(ho), []);
function L$(n, e, t) {
  let i = [];
  for (let r = n.firstChild, s = e; ; r = r.nextSibling) {
    let o = r ? r.from : t;
    if (o > s && i.push({ from: s, to: o }), !r)
      break;
    s = r.to;
  }
  return i;
}
function Y$(n) {
  let { codeParser: e, htmlParser: t } = n;
  return { wrap: Tf((r, s) => {
    let o = r.type.id;
    if (e && (o == $.CodeBlock || o == $.FencedCode)) {
      let l = "";
      if (o == $.FencedCode) {
        let h = r.node.getChild($.CodeInfo);
        h && (l = s.read(h.from, h.to));
      }
      let a = e(l);
      if (a)
        return { parser: a, overlay: (h) => h.type.id == $.CodeText, bracketed: o == $.FencedCode };
    } else if (t && (o == $.HTMLBlock || o == $.HTMLTag || o == $.CommentBlock))
      return { parser: t, overlay: L$(r.node, r.from, r.to) };
    return null;
  }) };
}
const V$ = { resolve: "Strikethrough", mark: "StrikethroughMark" }, U$ = {
  defineNodes: [{
    name: "Strikethrough",
    style: { "Strikethrough/...": m.strikethrough }
  }, {
    name: "StrikethroughMark",
    style: m.processingInstruction
  }],
  parseInline: [{
    name: "Strikethrough",
    parse(n, e, t) {
      if (e != 126 || n.char(t + 1) != 126 || n.char(t + 2) == 126)
        return -1;
      let i = n.slice(t - 1, t), r = n.slice(t + 2, t + 3), s = /\s|^$/.test(i), o = /\s|^$/.test(r), l = Xn.test(i), a = Xn.test(r);
      return n.addDelimiter(V$, t, t + 2, !o && (!a || s || l), !s && (!l || o || a));
    },
    after: "Emphasis"
  }]
};
function On(n, e, t = 0, i, r = 0) {
  let s = 0, o = !0, l = -1, a = -1, h = !1, O = () => {
    i.push(n.elt("TableCell", r + l, r + a, n.parser.parseInline(e.slice(l, a), r + l)));
  };
  for (let c = t; c < e.length; c++) {
    let f = e.charCodeAt(c);
    f == 124 && !h ? ((!o || l > -1) && s++, o = !1, i && (l > -1 && O(), i.push(n.elt("TableDelimiter", c + r, c + r + 1))), l = a = -1) : (h || f != 32 && f != 9) && (l < 0 && (l = c), a = c + 1), h = !h && f == 92;
  }
  return l > -1 && (s++, i && O()), s;
}
function EO(n, e) {
  for (let t = e; t < n.length; t++) {
    let i = n.charCodeAt(t);
    if (i == 124)
      return !0;
    i == 92 && t++;
  }
  return !1;
}
const Op = /^[>\s]*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/;
class LO {
  constructor() {
    this.rows = null;
  }
  nextLine(e, t, i) {
    if (this.rows == null) {
      this.rows = !1;
      let r;
      if ((t.next == 45 || t.next == 58 || t.next == 124) && Op.test(r = t.text.slice(t.pos))) {
        let s = [];
        On(e, i.content, 0, s, i.start) == On(e, r, 0) && (this.rows = [
          e.elt("TableHeader", i.start, i.start + i.content.length, s),
          e.elt("TableDelimiter", e.lineStart + t.pos, e.lineStart + t.text.length)
        ]);
      }
    } else if (this.rows) {
      let r = [];
      On(e, t.text, t.pos, r, e.lineStart), this.rows.push(e.elt("TableRow", e.lineStart + t.pos, e.lineStart + t.text.length, r));
    }
    return !1;
  }
  finish(e, t) {
    return this.rows ? (e.addLeafElement(t, e.elt("Table", t.start, t.start + t.content.length, this.rows)), !0) : !1;
  }
}
const D$ = {
  defineNodes: [
    { name: "Table", block: !0 },
    { name: "TableHeader", style: { "TableHeader/...": m.heading } },
    "TableRow",
    { name: "TableCell", style: m.content },
    { name: "TableDelimiter", style: m.processingInstruction }
  ],
  parseBlock: [{
    name: "Table",
    leaf(n, e) {
      return EO(e.content, 0) ? new LO() : null;
    },
    endLeaf(n, e, t) {
      if (t.parsers.some((r) => r instanceof LO) || !EO(e.text, e.basePos))
        return !1;
      let i = n.peekLine();
      return Op.test(i) && On(n, e.text, e.basePos) == On(n, i, e.basePos);
    },
    before: "SetextHeading"
  }]
};
class B$ {
  nextLine() {
    return !1;
  }
  finish(e, t) {
    return e.addLeafElement(t, e.elt("Task", t.start, t.start + t.content.length, [
      e.elt("TaskMarker", t.start, t.start + 3),
      ...e.parser.parseInline(t.content.slice(3), t.start + 3)
    ])), !0;
  }
}
const I$ = {
  defineNodes: [
    { name: "Task", block: !0, style: m.list },
    { name: "TaskMarker", style: m.atom }
  ],
  parseBlock: [{
    name: "TaskList",
    leaf(n, e) {
      return /^\[[ xX]\][ \t]/.test(e.content) && n.parentType().name == "ListItem" ? new B$() : null;
    },
    after: "SetextHeading"
  }]
}, YO = /(www\.)|(https?:\/\/)|([\w.+-]{1,100}@)|(mailto:|xmpp:)/gy, VO = /[\w-]+(\.[\w-]+)+(:\d+)?(\/[^\s<]*)?/gy, G$ = /[\w-]+\.[\w-]+($|[/:])/, UO = /[\w.+-]+@[\w-]+(\.[\w.-]+)+/gy, DO = /\/[a-zA-Z\d@.]+/gy;
function BO(n, e, t, i) {
  let r = 0;
  for (let s = e; s < t; s++)
    n[s] == i && r++;
  return r;
}
function N$(n, e) {
  VO.lastIndex = e;
  let t = VO.exec(n);
  if (!t || G$.exec(t[0])[0].indexOf("_") > -1)
    return -1;
  let i = e + t[0].length;
  for (; ; ) {
    let r = n[i - 1], s;
    if (/[?!.,:*_~]/.test(r) || r == ")" && BO(n, e, i, ")") > BO(n, e, i, "("))
      i--;
    else if (r == ";" && (s = /&(?:#\d+|#x[a-f\d]+|\w+);$/.exec(n.slice(e, i))))
      i = e + s.index;
    else
      break;
  }
  return i;
}
function IO(n, e) {
  UO.lastIndex = e;
  let t = UO.exec(n);
  if (!t)
    return -1;
  let i = t[0][t[0].length - 1];
  return i == "_" || i == "-" ? -1 : e + t[0].length - (i == "." ? 1 : 0);
}
const F$ = {
  parseInline: [{
    name: "Autolink",
    parse(n, e, t) {
      let i = t - n.offset;
      if (i && /\w/.test(n.text[i - 1]))
        return -1;
      YO.lastIndex = i;
      let r = YO.exec(n.text), s = -1;
      if (!r)
        return -1;
      if (r[1] || r[2]) {
        if (s = N$(n.text, i + r[0].length), s > -1 && n.hasOpenLink) {
          let o = /([^\[\]]|\[[^\]]*\])*/.exec(n.text.slice(i, s));
          s = i + o[0].length;
        }
      } else r[3] ? s = IO(n.text, i) : (s = IO(n.text, i + r[0].length), s > -1 && r[0] == "xmpp:" && (DO.lastIndex = s, r = DO.exec(n.text), r && (s = r.index + r[0].length)));
      return s < 0 ? -1 : (n.addElement(n.elt("URL", t, s + n.offset)), s + n.offset);
    }
  }]
}, H$ = [D$, I$, U$, F$];
function cp(n, e, t) {
  return (i, r, s) => {
    if (r != n || i.char(s + 1) == n)
      return -1;
    let o = [i.elt(t, s, s + 1)];
    for (let l = s + 1; l < i.end; l++) {
      let a = i.char(l);
      if (a == n)
        return i.addElement(i.elt(e, s, l + 1, o.concat(i.elt(t, l, l + 1))));
      if (a == 92 && o.push(i.elt("Escape", l, l++ + 2)), Ue(a))
        break;
    }
    return -1;
  };
}
const K$ = {
  defineNodes: [
    { name: "Superscript", style: m.special(m.content) },
    { name: "SuperscriptMark", style: m.processingInstruction }
  ],
  parseInline: [{
    name: "Superscript",
    parse: cp(94, "Superscript", "SuperscriptMark")
  }]
}, J$ = {
  defineNodes: [
    { name: "Subscript", style: m.special(m.content) },
    { name: "SubscriptMark", style: m.processingInstruction }
  ],
  parseInline: [{
    name: "Subscript",
    parse: cp(126, "Subscript", "SubscriptMark")
  }]
}, ex = {
  defineNodes: [{ name: "Emoji", style: m.character }],
  parseInline: [{
    name: "Emoji",
    parse(n, e, t) {
      let i;
      return e != 58 || !(i = /^[a-zA-Z_0-9]+:/.exec(n.slice(t + 1, n.end))) ? -1 : n.addElement(n.elt("Emoji", t, t + 1 + i[0].length));
    }
  }]
}, fp = /* @__PURE__ */ hs({ commentTokens: { block: { open: "<!--", close: "-->" } } }), up = /* @__PURE__ */ new q(), dp = /* @__PURE__ */ E$.configure({
  props: [
    /* @__PURE__ */ It.add((n) => !n.is("Block") || n.is("Document") || dl(n) != null || tx(n) ? void 0 : (e, t) => ({ from: t.doc.lineAt(e.from).to, to: e.to })),
    /* @__PURE__ */ up.add(dl),
    /* @__PURE__ */ Bt.add({
      Document: () => null
    }),
    /* @__PURE__ */ Rt.add({
      Document: fp
    })
  ]
});
function dl(n) {
  let e = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
  return e ? +e[1] : void 0;
}
function tx(n) {
  return n.name == "OrderedList" || n.name == "BulletList";
}
function ix(n, e) {
  let t = n;
  for (; ; ) {
    let i = t.nextSibling, r;
    if (!i || (r = dl(i.type)) != null && r <= e)
      break;
    t = i;
  }
  return t.to;
}
const nx = /* @__PURE__ */ jf.of((n, e, t) => {
  for (let i = I(n).resolveInner(t, -1); i && !(i.from < e); i = i.parent) {
    let r = i.type.prop(up);
    if (r == null)
      continue;
    let s = ix(i, r);
    if (s > t)
      return { from: t, to: s };
  }
  return null;
});
function pa(n) {
  return new We(fp, n, [], "markdown");
}
const rx = /* @__PURE__ */ pa(dp), sx = /* @__PURE__ */ dp.configure([H$, J$, K$, ex, {
  props: [
    /* @__PURE__ */ It.add({
      Table: (n, e) => ({ from: e.doc.lineAt(n.from).to, to: n.to })
    })
  ]
}]), es = /* @__PURE__ */ pa(sx);
function ox(n, e) {
  return (t) => {
    if (t && n) {
      let i = null;
      if (t = /\S*/.exec(t)[0], typeof n == "function" ? i = n(t) : i = jr.matchLanguageName(n, t, !0), i instanceof jr)
        return i.support ? i.support.language.parser : li.getSkippingParser(i.load());
      if (i)
        return i.parser;
    }
    return e ? e.parser : null;
  };
}
class Oo {
  constructor(e, t, i, r, s, o, l) {
    this.node = e, this.from = t, this.to = i, this.spaceBefore = r, this.spaceAfter = s, this.type = o, this.item = l;
  }
  blank(e, t = !0) {
    let i = this.spaceBefore + (this.node.name == "Blockquote" ? ">" : "");
    if (e != null) {
      for (; i.length < e; )
        i += " ";
      return i;
    } else {
      for (let r = this.to - this.from - i.length - this.spaceAfter.length; r > 0; r--)
        i += " ";
      return i + (t ? this.spaceAfter : "");
    }
  }
  marker(e, t) {
    let i = this.node.name == "OrderedList" ? String(+mp(this.item, e)[2] + t) : "";
    return this.spaceBefore + i + this.type + this.spaceAfter;
  }
}
function pp(n, e) {
  let t = [], i = [];
  for (let r = n; r; r = r.parent) {
    if (r.name == "FencedCode")
      return i;
    (r.name == "ListItem" || r.name == "Blockquote") && t.push(r);
  }
  for (let r = t.length - 1; r >= 0; r--) {
    let s = t[r], o, l = e.lineAt(s.from), a = s.from - l.from;
    if (s.name == "Blockquote" && (o = /^ *>( ?)/.exec(l.text.slice(a))))
      i.push(new Oo(s, a, a + o[0].length, "", o[1], ">", null));
    else if (s.name == "ListItem" && s.parent.name == "OrderedList" && (o = /^( *)\d+([.)])( *)/.exec(l.text.slice(a)))) {
      let h = o[3], O = o[0].length;
      h.length >= 4 && (h = h.slice(0, h.length - 4), O -= 4), i.push(new Oo(s.parent, a, a + O, o[1], h, o[2], s));
    } else if (s.name == "ListItem" && s.parent.name == "BulletList" && (o = /^( *)([-+*])( {1,4}\[[ xX]\])?( +)/.exec(l.text.slice(a)))) {
      let h = o[4], O = o[0].length;
      h.length > 4 && (h = h.slice(0, h.length - 4), O -= 4);
      let c = o[2];
      o[3] && (c += o[3].replace(/[xX]/, " ")), i.push(new Oo(s.parent, a, a + O, o[1], h, c, s));
    }
  }
  return i;
}
function mp(n, e) {
  return /^(\s*)(\d+)(?=[.)])/.exec(e.sliceString(n.from, n.from + 10));
}
function co(n, e, t, i = 0) {
  for (let r = -1, s = n; ; ) {
    if (s.name == "ListItem") {
      let l = mp(s, e), a = +l[2];
      if (r >= 0) {
        if (a != r + 1)
          return;
        t.push({ from: s.from + l[1].length, to: s.from + l[0].length, insert: String(r + 2 + i) });
      }
      r = a;
    }
    let o = s.nextSibling;
    if (!o)
      break;
    s = o;
  }
}
function ma(n, e) {
  let t = /^[ \t]*/.exec(n)[0].length;
  if (!t || e.facet(An) != "	")
    return n;
  let i = ct(n, 4, t), r = "";
  for (let s = i; s > 0; )
    s >= 4 ? (r += "	", s -= 4) : (r += " ", s--);
  return r + n.slice(t);
}
const lx = (n = {}) => ({ state: e, dispatch: t }) => {
  let i = I(e), { doc: r } = e, s = null, o = e.changeByRange((l) => {
    if (!l.empty || !es.isActiveAt(e, l.from, -1) && !es.isActiveAt(e, l.from, 1))
      return s = { range: l };
    let a = l.from, h = r.lineAt(a), O = pp(i.resolveInner(a, -1), r);
    for (; O.length && O[O.length - 1].from > a - h.from; )
      O.pop();
    if (!O.length)
      return s = { range: l };
    let c = O[O.length - 1];
    if (c.to - c.spaceAfter.length > a - h.from)
      return s = { range: l };
    let f = a >= c.to - c.spaceAfter.length && !/\S/.test(h.text.slice(c.to));
    if (c.item && f) {
      if (c.item.from < h.from && !/^[\s>]*$/.test(h.text.slice(0, c.to)))
        return s = { range: l };
      let Q = c.node.firstChild, b = c.node.getChild("ListItem", "ListItem");
      if (Q.to >= a || b && b.to < a || h.from > 0 && !/[^\s>]/.test(r.lineAt(h.from - 1).text) || n.nonTightLists === !1) {
        let y = O.length > 1 ? O[O.length - 2] : null, C, k = "";
        y && y.item ? (C = h.from + y.from, k = y.marker(r, 1)) : C = h.from + (y ? y.to : 0);
        let x = [{ from: C, to: a, insert: k }];
        return c.node.name == "OrderedList" && co(c.item, r, x, -2), y && y.node.name == "OrderedList" && co(y.item, r, x), { range: S.cursor(C + k.length), changes: x };
      } else {
        let y = NO(O, e, h);
        return {
          range: S.cursor(a + y.length + 1),
          changes: { from: h.from, insert: y + e.lineBreak }
        };
      }
    }
    if (c.node.name == "Blockquote" && f && h.from) {
      let Q = r.lineAt(h.from - 1), b = />\s*$/.exec(Q.text);
      if (b && b.index == c.from) {
        let y = e.changes([
          { from: Q.from + b.index, to: Q.to },
          { from: h.from + c.from, to: h.to }
        ]);
        return { range: l.map(y), changes: y };
      }
    }
    let u = [];
    c.node.name == "OrderedList" && co(c.item, r, u);
    let d = c.item && c.item.from < h.from, p = "";
    if (!d || /^[\s\d.)\-+*>]*/.exec(h.text)[0].length >= c.to)
      for (let Q = 0, b = O.length - 1; Q <= b; Q++)
        p += Q == b && !d ? O[Q].marker(r, 1) : O[Q].blank(Q < b ? ct(h.text, 4, O[Q + 1].from) - p.length : null);
    let g = a;
    for (; g > h.from && /\s/.test(h.text.charAt(g - h.from - 1)); )
      g--;
    return p = ma(p, e), hx(c.node, e.doc) && (p = NO(O, e, h) + e.lineBreak + p), u.push({ from: g, to: a, insert: e.lineBreak + p }), { range: S.cursor(g + p.length + 1), changes: u };
  });
  return s ? !1 : (t(e.update(o, { scrollIntoView: !0, userEvent: "input" })), !0);
}, ax = /* @__PURE__ */ lx();
function GO(n) {
  return n.name == "QuoteMark" || n.name == "ListMark";
}
function hx(n, e) {
  if (n.name != "OrderedList" && n.name != "BulletList")
    return !1;
  let t = n.firstChild, i = n.getChild("ListItem", "ListItem");
  if (!i)
    return !1;
  let r = e.lineAt(t.to), s = e.lineAt(i.from), o = /^[\s>]*$/.test(r.text);
  return r.number + (o ? 0 : 1) < s.number;
}
function NO(n, e, t) {
  let i = "";
  for (let r = 0, s = n.length - 2; r <= s; r++)
    i += n[r].blank(r < s ? ct(t.text, 4, n[r + 1].from) - i.length : null, r < s);
  return ma(i, e);
}
function Ox(n, e) {
  let t = n.resolveInner(e, -1), i = e;
  GO(t) && (i = t.from, t = t.parent);
  for (let r; r = t.childBefore(i); )
    if (GO(r))
      i = r.from;
    else if (r.name == "OrderedList" || r.name == "BulletList")
      t = r.lastChild, i = t.to;
    else
      break;
  return t;
}
const cx = ({ state: n, dispatch: e }) => {
  let t = I(n), i = null, r = n.changeByRange((s) => {
    let o = s.from, { doc: l } = n;
    if (s.empty && es.isActiveAt(n, s.from)) {
      let a = l.lineAt(o), h = pp(Ox(t, o), l);
      if (h.length) {
        let O = h[h.length - 1], c = O.to - O.spaceAfter.length + (O.spaceAfter ? 1 : 0);
        if (o - a.from > c && !/\S/.test(a.text.slice(c, o - a.from)))
          return {
            range: S.cursor(a.from + c),
            changes: { from: a.from + c, to: o }
          };
        if (o - a.from == c && // Only apply this if we're on the line that has the
        // construct's syntax, or there's only indentation in the
        // target range
        (O.item && a.from <= O.item.from || /^[\s>]*$/.test(a.text.slice(0, O.to)))) {
          let f = a.from + O.from;
          if (O.item && O.node.from < O.item.from && /\S/.test(a.text.slice(O.from, O.to))) {
            let u = O.blank(ct(a.text, 4, O.to) - ct(a.text, 4, O.from));
            return f == a.from && (u = ma(u, n)), {
              range: S.cursor(f + u.length),
              changes: { from: f, to: a.from + O.to, insert: u }
            };
          }
          if (f < o)
            return { range: S.cursor(f), changes: { from: f, to: o } };
        }
      }
    }
    return i = { range: s };
  });
  return i ? !1 : (e(n.update(r, { scrollIntoView: !0, userEvent: "delete" })), !0);
}, fx = [
  { key: "Enter", run: ax },
  { key: "Backspace", run: cx }
], gp = /* @__PURE__ */ w$({ matchClosingTags: !1 });
function Ix(n = {}) {
  let { codeLanguages: e, defaultCodeLanguage: t, addKeymap: i = !0, base: { parser: r } = rx, completeHTMLTags: s = !0, pasteURLAsLink: o = !0, htmlTagLanguage: l = gp } = n;
  if (!(r instanceof bs))
    throw new RangeError("Base parser provided to `markdown` should be a Markdown parser");
  let a = n.extensions ? [n.extensions] : [], h = [l.support, nx], O;
  o && h.push(mx), t instanceof ai ? (h.push(t.support), O = t.language) : t && (O = t);
  let c = e || O ? ox(e, O) : void 0;
  a.push(Y$({ codeParser: c, htmlParser: l.language.parser })), i && h.push(xt.high(ls.of(fx)));
  let f = pa(r.configure(a));
  return s && h.push(f.data.of({ autocomplete: ux })), new ai(f, h);
}
function ux(n) {
  let { state: e, pos: t } = n, i = /<[:\-\.\w\u00b7-\uffff]*$/.exec(e.sliceDoc(t - 25, t));
  if (!i)
    return null;
  let r = I(e).resolveInner(t, -1);
  for (; r && !r.type.isTop; ) {
    if (r.name == "CodeBlock" || r.name == "FencedCode" || r.name == "ProcessingInstructionBlock" || r.name == "CommentBlock" || r.name == "Link" || r.name == "Image")
      return null;
    r = r.parent;
  }
  return {
    from: t - i[0].length,
    to: t,
    options: dx(),
    validFor: /^<[:\-\.\w\u00b7-\uffff]*$/
  };
}
let fo = null;
function dx() {
  if (fo)
    return fo;
  let n = $$(new Il(D.create({ extensions: gp }), 0, !0));
  return fo = n ? n.options : [];
}
const px = /code|horizontalrule|html|link|comment|processing|escape|entity|image|mark|url/i, mx = /* @__PURE__ */ T.domEventHandlers({
  paste: (n, e) => {
    var t;
    let { main: i } = e.state.selection;
    if (i.empty)
      return !1;
    let r = (t = n.clipboardData) === null || t === void 0 ? void 0 : t.getData("text/plain");
    if (!r || !/^(https?:\/\/|mailto:|xmpp:|www\.)/.test(r) || (/^www\./.test(r) && (r = "https://" + r), !es.isActiveAt(e.state, i.from, 1)))
      return !1;
    let s = I(e.state), o = !1;
    return s.iterate({
      from: i.from,
      to: i.to,
      enter: (l) => {
        (l.from > i.from || px.test(l.name)) && (o = !0);
      },
      leave: (l) => {
        l.to < i.to && (o = !0);
      }
    }), o ? !1 : (e.dispatch({
      changes: [{ from: i.from, insert: "[" }, { from: i.to, insert: `](${r})` }],
      userEvent: "input.paste",
      scrollIntoView: !0
    }), !0);
  }
});
export {
  ts as Compartment,
  D as EditorState,
  T as EditorView,
  us as HighlightStyle,
  ai as LanguageSupport,
  W as StateEffect,
  $e as StateField,
  Nf as StreamLanguage,
  Vx as autocompletion,
  Ax as bracketMatching,
  Lx as closeBrackets,
  Yx as closeBracketsKeymap,
  M1 as completionKeymap,
  xx as crosshairCursor,
  Q$ as css,
  Rx as defaultHighlightStyle,
  zx as defaultKeymap,
  Sx as drawSelection,
  bx as dropCursor,
  Cx as foldGutter,
  Xx as foldKeymap,
  yx as highlightActiveLine,
  wx as highlightActiveLineGutter,
  _x as highlightSelectionMatches,
  jx as history,
  Wx as historyKeymap,
  w$ as html,
  An as indentUnit,
  Mx as indentWithTab,
  Cb as javascript,
  Dx as json,
  ls as keymap,
  Px as lineNumbers,
  Ix as markdown,
  kx as placeholder,
  Bx as python,
  $x as rectangularSelection,
  Ex as searchKeymap,
  Zx as syntaxHighlighting,
  m as tags
};
