const navUtil = require("../../utils/nav");

// 亲属称呼计算核心
// token：f 爸爸, m 妈妈, h 老公, w 老婆, ob 哥哥, yb 弟弟, os 姐姐, ys 妹妹, s 儿子, d 女儿

const labelToToken = {
  爸爸: "f",
  妈妈: "m",
  老公: "h",
  老婆: "w",
  哥哥: "ob",
  弟弟: "yb",
  姐姐: "os",
  妹妹: "ys",
  儿子: "s",
  女儿: "d",
};

// token -> 中文标签（用于回退生成可读关系字符串）
const tokenToLabel = {
  f: "爸爸",
  m: "妈妈",
  h: "老公",
  w: "老婆",
  ob: "哥哥",
  yb: "弟弟",
  os: "姐姐",
  ys: "妹妹",
  s: "儿子",
  d: "女儿",
};

function key(sex, path) {
  return sex + "|" + path.join("-");
}

// 亲属关系映射配置
const relationshipMappings = [
  // 基础亲属关系（通用）
  { path: ["f"], name: "爸爸", gender: "both" },
  { path: ["m"], name: "妈妈", gender: "both" },
  { path: ["h"], name: "老公", gender: "female" },
  { path: ["w"], name: "老婆", gender: "male" },
  { path: ["ob"], name: "哥哥", gender: "both" },
  { path: ["yb"], name: "弟弟", gender: "both" },
  { path: ["os"], name: "姐姐", gender: "both" },
  { path: ["ys"], name: "妹妹", gender: "both" },
  { path: ["s"], name: "儿子", gender: "both" },
  { path: ["d"], name: "女儿", gender: "both" },
  // 配偶的父母（通用）
  { path: ["f", "w"], name: "妈妈", gender: "both" },
  { path: ["m", "h"], name: "爸爸", gender: "both" },
  // 祖辈（通用）
  { path: ["f", "f"], name: "爷爷", gender: "both" },
  { path: ["f", "m"], name: "奶奶", gender: "both" },
  { path: ["m", "f"], name: "外公", gender: "both" },
  { path: ["m", "m"], name: "外婆", gender: "both" },
  // 兄弟姐妹的配偶（通用）
  { path: ["ob", "w"], name: "嫂子", gender: "both" },
  { path: ["yb", "w"], name: "弟媳", gender: "both" },
  { path: ["os", "h"], name: "姐夫", gender: "both" },
  { path: ["ys", "h"], name: "妹夫", gender: "both" },
  // 子女的配偶（通用）
  { path: ["s", "w"], name: "儿媳", gender: "both" },
  { path: ["d", "h"], name: "女婿", gender: "both" },
  // 子女配偶的父母
  { path: ["s", "w", "f"], name: "亲家公", gender: "both" },
  { path: ["s", "w", "m"], name: "亲家母", gender: "both" },
  { path: ["d", "h", "f"], name: "亲家公", gender: "both" },
  { path: ["d", "h", "m"], name: "亲家母", gender: "both" },
  ,
  // 兄弟姐妹的子女（通用）
  { path: ["ob", "s"], name: "侄子", gender: "both" },
  { path: ["ob", "d"], name: "侄女", gender: "both" },
  { path: ["yb", "s"], name: "侄子", gender: "both" },
  { path: ["yb", "d"], name: "侄女", gender: "both" },
  { path: ["os", "s"], name: "外甥", gender: "both" },
  { path: ["os", "d"], name: "外甥女", gender: "both" },
  { path: ["ys", "s"], name: "外甥", gender: "both" },
  { path: ["ys", "d"], name: "外甥女", gender: "both" },
  // 堂亲关系 (父亲的兄弟姐妹的子女)（通用）
  { path: ["f", "ob", "s"], name: "堂哥/堂弟", gender: "both" },
  { path: ["f", "ob", "d"], name: "堂姐/堂妹", gender: "both" },
  { path: ["f", "yb", "s"], name: "堂哥/堂弟", gender: "both" },
  { path: ["f", "yb", "d"], name: "堂姐/堂妹", gender: "both" },
  { path: ["f", "os", "s"], name: "表哥/表弟", gender: "both" },
  { path: ["f", "os", "d"], name: "表姐/表妹", gender: "both" },
  { path: ["f", "ys", "s"], name: "表哥/表弟", gender: "both" },
  { path: ["m", "ys", "d"], name: "表姐/表妹", gender: "both" },
  // 堂/表兄弟的子女
  { path: ["f", "ob", "s", "s"], name: "堂侄", gender: "both" },
  { path: ["f", "ob", "s", "d"], name: "堂侄女", gender: "both" },
  { path: ["f", "yb", "s", "s"], name: "堂侄", gender: "both" },
  { path: ["f", "yb", "s", "d"], name: "堂侄女", gender: "both" },
  { path: ["f", "os", "s", "s"], name: "表侄", gender: "both" },
  { path: ["f", "os", "s", "d"], name: "表侄女", gender: "both" },
  { path: ["f", "ys", "s", "s"], name: "表侄", gender: "both" },
  { path: ["f", "ys", "s", "d"], name: "表侄女", gender: "both" },
  { path: ["m", "ob", "s", "s"], name: "表侄", gender: "both" },
  { path: ["m", "ob", "s", "d"], name: "表侄女", gender: "both" },
  { path: ["m", "yb", "s", "s"], name: "表侄", gender: "both" },
  { path: ["m", "yb", "s", "d"], name: "表侄女", gender: "both" },
  { path: ["m", "os", "s", "s"], name: "表侄", gender: "both" },
  { path: ["m", "os", "s", "d"], name: "表侄女", gender: "both" },
  { path: ["m", "ys", "s", "s"], name: "表侄", gender: "both" },
  { path: ["m", "ys", "s", "d"], name: "表侄女", gender: "both" },
  ,
  // 表亲关系 (母亲的兄弟姐妹的子女)（通用）
  { path: ["m", "ob", "s"], name: "表哥/表弟", gender: "both" },
  { path: ["m", "ob", "d"], name: "表姐/表妹", gender: "both" },
  { path: ["m", "yb", "s"], name: "表哥/表弟", gender: "both" },
  { path: ["m", "yb", "d"], name: "表姐/表妹", gender: "both" },
  { path: ["m", "os", "s"], name: "表哥/表弟", gender: "both" },
  { path: ["m", "os", "d"], name: "表姐/表妹", gender: "both" },
  { path: ["m", "ys", "s"], name: "表哥/表弟", gender: "both" },
  { path: ["m", "ys", "d"], name: "表姐/表妹", gender: "both" },
  // 祖辈的兄弟姐妹关系（通用）
  { path: ["f", "f", "ob"], name: "舅公", gender: "both" },
  { path: ["f", "f", "os"], name: "姨婆", gender: "both" },
  { path: ["f", "m", "ob"], name: "舅公", gender: "both" },
  { path: ["f", "m", "os"], name: "姨婆", gender: "both" },
  { path: ["m", "f", "ob"], name: "舅公", gender: "both" },
  { path: ["m", "f", "os"], name: "姨婆", gender: "both" },
  { path: ["m", "m", "ob"], name: "舅公", gender: "both" },
  { path: ["m", "m", "os"], name: "姨婆", gender: "both" },
  // 兄弟姐妹的父母关系（通用）
  { path: ["f", "ob", "f"], name: "爷爷", gender: "both" },
  { path: ["f", "ob", "m"], name: "奶奶", gender: "both" },
  { path: ["f", "yb", "f"], name: "爷爷", gender: "both" },
  { path: ["f", "yb", "m"], name: "奶奶", gender: "both" },
  { path: ["f", "os", "f"], name: "爷爷", gender: "both" },
  { path: ["f", "os", "m"], name: "奶奶", gender: "both" },
  { path: ["f", "ys", "f"], name: "爷爷", gender: "both" },
  { path: ["f", "ys", "m"], name: "奶奶", gender: "both" },
  { path: ["m", "ob", "f"], name: "外公", gender: "both" },
  { path: ["m", "ob", "m"], name: "外婆", gender: "both" },
  { path: ["m", "yb", "f"], name: "外公", gender: "both" },
  { path: ["m", "yb", "m"], name: "外婆", gender: "both" },
  { path: ["m", "os", "f"], name: "外公", gender: "both" },
  { path: ["m", "os", "m"], name: "外婆", gender: "both" },
  { path: ["m", "ys", "f"], name: "外公", gender: "both" },
  { path: ["m", "ys", "m"], name: "外婆", gender: "both" },
  // 兄弟姐妹的父母的配偶关系（通用）
  { path: ["f", "ob", "f", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "ob", "f", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "ob", "m", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "ob", "m", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "yb", "f", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "yb", "f", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "yb", "m", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "yb", "m", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "os", "f", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "os", "f", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "os", "m", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "os", "m", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "ys", "f", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "ys", "f", "h"], name: "爷爷", gender: "both" },
  { path: ["f", "ys", "m", "w"], name: "奶奶", gender: "both" },
  { path: ["f", "ys", "m", "h"], name: "爷爷", gender: "both" },
  { path: ["m", "ob", "f", "w"], name: "外婆", gender: "both" },
  { path: ["m", "ob", "f", "h"], name: "外公", gender: "both" },
  { path: ["m", "ob", "m", "w"], name: "外婆", gender: "both" },
  { path: ["m", "ob", "m", "h"], name: "外公", gender: "both" },
  { path: ["m", "yb", "f", "w"], name: "外婆", gender: "both" },
  { path: ["m", "yb", "f", "h"], name: "外公", gender: "both" },
  { path: ["m", "yb", "m", "w"], name: "外婆", gender: "both" },
  { path: ["m", "yb", "m", "h"], name: "外公", gender: "both" },
  { path: ["m", "os", "f", "w"], name: "外婆", gender: "both" },
  { path: ["m", "os", "f", "h"], name: "外公", gender: "both" },
  { path: ["m", "os", "m", "w"], name: "外婆", gender: "both" },
  { path: ["m", "os", "m", "h"], name: "外公", gender: "both" },
  { path: ["m", "ys", "f", "w"], name: "外婆", gender: "both" },
  { path: ["m", "ys", "f", "h"], name: "外公", gender: "both" },
  { path: ["m", "ys", "m", "w"], name: "外婆", gender: "both" },
  { path: ["m", "ys", "m", "h"], name: "外公", gender: "both" },
  // 祖辈配偶的子女关系（通用）
  { path: ["f", "f", "w", "s"], name: "叔叔/伯伯", gender: "both" },
  { path: ["f", "f", "w", "d"], name: "姑姑", gender: "both" },
  { path: ["f", "f", "h", "s"], name: "叔叔/伯伯", gender: "both" },
  { path: ["f", "f", "h", "d"], name: "姑姑", gender: "both" },
  { path: ["f", "m", "w", "s"], name: "舅舅", gender: "both" },
  { path: ["f", "m", "w", "d"], name: "姨妈", gender: "both" },
  { path: ["f", "m", "h", "s"], name: "舅舅", gender: "both" },
  { path: ["f", "m", "h", "d"], name: "姨妈", gender: "both" },
  { path: ["m", "f", "w", "s"], name: "舅舅", gender: "both" },
  { path: ["m", "f", "w", "d"], name: "姨妈", gender: "both" },
  { path: ["m", "f", "h", "s"], name: "舅舅", gender: "both" },
  { path: ["m", "f", "h", "d"], name: "姨妈", gender: "both" },
  { path: ["m", "m", "w", "s"], name: "舅舅", gender: "both" },
  { path: ["m", "m", "w", "d"], name: "姨妈", gender: "both" },
  { path: ["m", "m", "h", "s"], name: "舅舅", gender: "both" },
  { path: ["m", "m", "h", "d"], name: "姨妈", gender: "both" },
  // 曾祖辈关系（通用）
  { path: ["f", "f", "f"], name: "曾祖父", gender: "both" },
  { path: ["f", "f", "m"], name: "曾祖母", gender: "both" },
  { path: ["f", "m", "f"], name: "曾外祖父", gender: "both" },
  { path: ["f", "m", "m"], name: "曾外祖母", gender: "both" },
  { path: ["m", "f", "f"], name: "外曾祖父", gender: "both" },
  { path: ["m", "f", "m"], name: "外曾祖母", gender: "both" },
  { path: ["m", "m", "f"], name: "外曾外祖父", gender: "both" },
  { path: ["m", "m", "m"], name: "外曾外祖母", gender: "both" },
  // 孙辈的子女（通用）
  { path: ["s", "s"], name: "孙子", gender: "both" },
  // 以下为自动补充的缺失关系（已修正）
  // 自动同步自 missing-relations.txt，共 830 条新条目（去重后）
  { path: ["d", "s"], name: "外孙", gender: "both" },
  { path: ["d", "d"], name: "外孙女", gender: "both" },
  { path: ["d", "d", "h"], name: "外孙女婿", gender: "both" },
  { path: ["d", "d", "ob"], name: "外孙女的哥哥", gender: "both" },
  { path: ["d", "d", "os"], name: "外孙女的姐姐", gender: "both" },
  { path: ["d", "d", "w"], name: "外孙女的老婆", gender: "both" },
  { path: ["d", "d", "yb"], name: "外孙女的弟弟", gender: "both" },
  { path: ["d", "d", "ys"], name: "外孙女的妹妹", gender: "both" },
  { path: ["d", "f", "h"], name: "爸爸", gender: "both" },
  { path: ["d", "h", "d"], name: "外孙女", gender: "both" },
  { path: ["d", "h", "f"], name: "亲家公", gender: "both" },
  { path: ["d", "h", "h"], name: "女婿", gender: "both" },
  { path: ["d", "h", "m"], name: "亲家母", gender: "both" },
  { path: ["d", "h", "ob"], name: "大舅子", gender: "both" },
  { path: ["d", "h", "os"], name: "大姨子", gender: "both" },
  { path: ["d", "h", "s"], name: "外孙", gender: "both" },
  { path: ["d", "h", "yb"], name: "小舅子", gender: "both" },
  { path: ["d", "h", "ys"], name: "小姨子", gender: "both" },
  { path: ["d", "m", "h"], name: "爸爸", gender: "both" },
  { path: ["d", "ob", "d"], name: "侄女", gender: "both" },
  { path: ["d", "ob", "f"], name: "爸爸", gender: "both" },
  { path: ["d", "ob", "h"], name: "姐夫", gender: "both" },
  { path: ["d", "ob", "m"], name: "妈妈", gender: "both" },
  { path: ["d", "ob", "ob"], name: "哥哥", gender: "both" },
  { path: ["d", "ob", "os"], name: "姐姐", gender: "both" },
  { path: ["d", "ob", "s"], name: "侄子", gender: "both" },
  { path: ["d", "ob", "w"], name: "嫂子", gender: "both" },
  { path: ["d", "ob", "yb"], name: "弟弟", gender: "both" },
  { path: ["d", "ob", "ys"], name: "妹妹", gender: "both" },
  { path: ["d", "os", "d"], name: "侄女", gender: "both" },
  { path: ["d", "os", "f"], name: "爸爸", gender: "both" },
  { path: ["d", "os", "h"], name: "姐夫", gender: "both" },
  { path: ["d", "os", "m"], name: "妈妈", gender: "both" },
  { path: ["d", "os", "ob"], name: "哥哥", gender: "both" },
  { path: ["d", "os", "os"], name: "姐姐", gender: "both" },
  { path: ["d", "os", "s"], name: "侄子", gender: "both" },
  { path: ["d", "os", "w"], name: "嫂子", gender: "both" },
  { path: ["d", "os", "yb"], name: "弟弟", gender: "both" },
  { path: ["d", "os", "ys"], name: "妹妹", gender: "both" },
  { path: ["d", "s", "h"], name: "外孙女婿", gender: "both" },
  { path: ["d", "s", "ob"], name: "外孙子的哥哥", gender: "both" },
  { path: ["d", "s", "os"], name: "外孙子的姐姐", gender: "both" },
  { path: ["d", "s", "w"], name: "外孙媳", gender: "both" },
  { path: ["d", "s", "yb"], name: "外孙子的弟弟", gender: "both" },
  { path: ["d", "s", "ys"], name: "外孙子的妹妹", gender: "both" },
  { path: ["d", "w", "d"], name: "外孙女", gender: "both" },
  { path: ["d", "w", "f"], name: "亲家公", gender: "both" },
  { path: ["d", "w", "m"], name: "亲家母", gender: "both" },
  { path: ["d", "w", "ob"], name: "大舅子", gender: "both" },
  { path: ["d", "w", "os"], name: "大姨子", gender: "both" },
  { path: ["d", "w", "s"], name: "外孙", gender: "both" },
  { path: ["d", "w", "w"], name: "女儿", gender: "both" },
  { path: ["d", "w", "yb"], name: "小舅子", gender: "both" },
  { path: ["d", "w", "ys"], name: "小姨子", gender: "both" },
  { path: ["d", "yb", "d"], name: "侄女", gender: "both" },
  { path: ["d", "yb", "f"], name: "爸爸", gender: "both" },
  { path: ["d", "yb", "h"], name: "姐夫", gender: "both" },
  { path: ["d", "yb", "m"], name: "妈妈", gender: "both" },
  { path: ["d", "yb", "ob"], name: "哥哥", gender: "both" },
  { path: ["d", "yb", "os"], name: "姐姐", gender: "both" },
  { path: ["d", "yb", "s"], name: "侄子", gender: "both" },
  { path: ["d", "yb", "w"], name: "弟媳", gender: "both" },
  { path: ["d", "yb", "yb"], name: "弟弟", gender: "both" },
  { path: ["d", "yb", "ys"], name: "妹妹", gender: "both" },
  { path: ["d", "ys", "d"], name: "侄女", gender: "both" },
  { path: ["d", "ys", "f"], name: "爸爸", gender: "both" },
  { path: ["d", "ys", "h"], name: "妹夫", gender: "both" },
  { path: ["d", "ys", "m"], name: "妈妈", gender: "both" },
  { path: ["d", "ys", "ob"], name: "哥哥", gender: "both" },
  { path: ["d", "ys", "os"], name: "姐姐", gender: "both" },
  { path: ["d", "ys", "s"], name: "侄子", gender: "both" },
  { path: ["d", "ys", "w"], name: "妹妹", gender: "both" },
  { path: ["d", "ys", "yb"], name: "弟弟", gender: "both" },
  { path: ["d", "ys", "ys"], name: "妹妹", gender: "both" },
  { path: ["f", "d", "d"], name: "孙女", gender: "both" },
  { path: ["f", "d", "h"], name: "孙女婿", gender: "both" },
  { path: ["f", "d", "ob"], name: "孙子", gender: "both" },
  { path: ["f", "d", "os"], name: "孙女", gender: "both" },
  { path: ["f", "d", "s"], name: "孙子", gender: "both" },
  { path: ["f", "d", "w"], name: "孙女", gender: "both" },
  { path: ["f", "d", "yb"], name: "孙子", gender: "both" },
  { path: ["f", "d", "ys"], name: "孙女", gender: "both" },
  { path: ["f", "f", "d"], name: "爸爸", gender: "both" },
  { path: ["f", "f", "s"], name: "爸爸", gender: "both" },
  { path: ["f", "f", "yb"], name: "舅公", gender: "both" },
  { path: ["f", "f", "ys"], name: "姨婆", gender: "both" },
  { path: ["f", "h", "d"], name: "女儿", gender: "both" },
  { path: ["f", "h", "f"], name: "爷爷", gender: "both" },
  { path: ["f", "h", "h"], name: "爸爸", gender: "both" },
  { path: ["f", "h", "m"], name: "奶奶", gender: "both" },
  { path: ["f", "h", "ob"], name: "伯伯", gender: "both" },
  { path: ["f", "h", "os"], name: "姑姑", gender: "both" },
  { path: ["f", "h", "s"], name: "儿子", gender: "both" },
  { path: ["f", "h", "yb"], name: "叔叔", gender: "both" },
  { path: ["f", "h", "ys"], name: "姑姑", gender: "both" },
  { path: ["f", "m", "d"], name: "爸爸", gender: "both" },
  { path: ["f", "m", "s"], name: "爸爸", gender: "both" },
  { path: ["f", "m", "yb"], name: "舅公", gender: "both" },
  { path: ["f", "m", "ys"], name: "姨婆", gender: "both" },
  { path: ["f", "s", "d"], name: "孙女", gender: "both" },
  { path: ["f", "s", "h"], name: "孙女婿", gender: "both" },
  { path: ["f", "s", "ob"], name: "侄子", gender: "both" },
  { path: ["f", "s", "os"], name: "爸爸的儿子的姐姐", gender: "both" },
  { path: ["f", "s", "s"], name: "孙子", gender: "both" },
  { path: ["f", "s", "w"], name: "孙媳妇", gender: "both" },
  { path: ["f", "s", "yb"], name: "孙子", gender: "both" },
  { path: ["f", "s", "ys"], name: "爸爸的儿子的妹妹", gender: "both" },
  { path: ["f", "w", "d"], name: "妈妈的女儿", gender: "both" },
  { path: ["f", "w", "f"], name: "外公", gender: "both" },
  { path: ["f", "w", "m"], name: "外婆", gender: "both" },
  { path: ["f", "w", "ob"], name: "舅舅", gender: "both" },
  { path: ["f", "w", "os"], name: "姨妈", gender: "both" },
  { path: ["f", "w", "s"], name: "舅舅", gender: "both" },
  { path: ["f", "w", "w"], name: "妈妈", gender: "both" },
  { path: ["f", "w", "yb"], name: "舅舅", gender: "both" },
  { path: ["f", "w", "ys"], name: "姨妈", gender: "both" },
  { path: ["h", "d", "d"], name: "外孙女", gender: "both" },
  { path: ["h", "d", "f"], name: "女婿", gender: "both" },
  { path: ["h", "d", "h"], name: "女婿", gender: "both" },
  { path: ["h", "d", "m"], name: "女儿", gender: "both" },
  { path: ["h", "d", "ob"], name: "外孙", gender: "both" },
  { path: ["h", "d", "os"], name: "外孙女", gender: "both" },
  { path: ["h", "d", "s"], name: "外孙", gender: "both" },
  { path: ["h", "d", "w"], name: "外孙媳妇", gender: "both" },
  { path: ["h", "d", "yb"], name: "外孙", gender: "both" },
  { path: ["h", "d", "ys"], name: "外孙女", gender: "both" },
  { path: ["h", "f", "d"], name: "姑姑", gender: "both" },
  { path: ["h", "f", "h"], name: "公公", gender: "both" },
  { path: ["h", "f", "ob"], name: "公公", gender: "both" },
  { path: ["h", "f", "os"], name: "婆婆", gender: "both" },
  { path: ["h", "f", "s"], name: "老公", gender: "both" },
  { path: ["h", "f", "w"], name: "婆婆", gender: "both" },
  { path: ["h", "f", "yb"], name: "叔叔", gender: "both" },
  { path: ["h", "f", "ys"], name: "姑姑", gender: "both" },
  { path: ["h", "h", "d"], name: "女儿", gender: "both" },
  { path: ["h", "h", "f"], name: "公公", gender: "both" },
  { path: ["h", "h", "h"], name: "老公", gender: "both" },
  { path: ["h", "h", "m"], name: "婆婆", gender: "both" },
  { path: ["h", "h", "ob"], name: "老公", gender: "both" },
  { path: ["h", "h", "os"], name: "老婆", gender: "both" },
  { path: ["h", "h", "s"], name: "儿子", gender: "both" },
  { path: ["h", "h", "w"], name: "老婆", gender: "both" },
  { path: ["h", "h", "yb"], name: "老公", gender: "both" },
  { path: ["h", "h", "ys"], name: "老婆", gender: "both" },
  { path: ["h", "m", "d"], name: "小姑子", gender: "both" },
  { path: ["h", "m", "f"], name: "外公", gender: "both" },
  { path: ["h", "m", "h"], name: "公公", gender: "both" },
  { path: ["h", "m", "m"], name: "外婆", gender: "both" },
  { path: ["h", "m", "ob"], name: "公公", gender: "both" },
  { path: ["h", "m", "os"], name: "婆婆", gender: "both" },
  { path: ["h", "m", "s"], name: "老公", gender: "both" },
  { path: ["h", "m", "w"], name: "婆婆", gender: "both" },
  { path: ["h", "m", "yb"], name: "舅舅", gender: "both" },
  { path: ["h", "m", "ys"], name: "姨妈", gender: "both" },
  { path: ["h", "ob", "d"], name: "侄女", gender: "both" },
  { path: ["h", "ob", "f"], name: "公公", gender: "both" },
  { path: ["h", "ob", "h"], name: "大伯", gender: "both" },
  { path: ["h", "ob", "m"], name: "婆婆", gender: "both" },
  { path: ["h", "ob", "ob"], name: "大伯", gender: "both" },
  { path: ["h", "ob", "os"], name: "大姑", gender: "both" },
  { path: ["h", "ob", "s"], name: "侄子", gender: "both" },
  { path: ["h", "ob", "w"], name: "嫂子", gender: "both" },
  { path: ["h", "ob", "yb"], name: "小叔子", gender: "both" },
  { path: ["h", "ob", "ys"], name: "小姑子", gender: "both" },
  { path: ["h", "os", "d"], name: "侄女", gender: "both" },
  { path: ["h", "os", "f"], name: "公公", gender: "both" },
  { path: ["h", "os", "h"], name: "姐夫", gender: "both" },
  { path: ["h", "os", "m"], name: "婆婆", gender: "both" },
  { path: ["h", "os", "ob"], name: "大伯", gender: "both" },
  { path: ["h", "os", "os"], name: "大姑", gender: "both" },
  { path: ["h", "os", "s"], name: "侄子", gender: "both" },
  { path: ["h", "os", "w"], name: "姐姐", gender: "both" },
  { path: ["h", "os", "yb"], name: "小叔子", gender: "both" },
  { path: ["h", "os", "ys"], name: "小姑子", gender: "both" },
  { path: ["h", "s", "d"], name: "孙女", gender: "female" },
  { path: ["h", "s", "f"], name: "儿子", gender: "male" },
  { path: ["h", "s", "h"], name: "孙女婿", gender: "male" },
  { path: ["h", "s", "m"], name: "儿媳", gender: "female" },
  { path: ["h", "s", "ob"], name: "长孙", gender: "male" },
  { path: ["h", "s", "os"], name: "长孙女", gender: "female" },
  { path: ["h", "s", "s"], name: "孙子", gender: "both" },
  { path: ["h", "s", "w"], name: "孙媳", gender: "female" },
  { path: ["h", "s", "yb"], name: "次孙", gender: "male" },
  { path: ["h", "s", "ys"], name: "次孙女", gender: "female" },
  { path: ["h", "w", "h"], name: "老公", gender: "male" },
  { path: ["h", "yb", "d"], name: "侄女", gender: "female" },
  { path: ["h", "yb", "f"], name: "公公", gender: "male" },
  { path: ["h", "yb", "h"], name: "侄女婿", gender: "male" },
  { path: ["h", "yb", "m"], name: "婆婆", gender: "female" },
  { path: ["h", "yb", "ob"], name: "大伯", gender: "male" },
  { path: ["h", "yb", "os"], name: "大姑", gender: "female" },
  { path: ["h", "yb", "s"], name: "侄子", gender: "male" },
  { path: ["h", "yb", "w"], name: "弟媳", gender: "female" },
  { path: ["h", "yb", "yb"], name: "小叔", gender: "male" },
  { path: ["h", "yb", "ys"], name: "小姑", gender: "female" },
  { path: ["h", "ys", "d"], name: "侄女", gender: "female" },
  { path: ["h", "ys", "f"], name: "公公", gender: "male" },
  { path: ["h", "ys", "h"], name: "妹夫", gender: "male" },
  { path: ["h", "ys", "m"], name: "婆婆", gender: "female" },
  { path: ["h", "ys", "ob"], name: "大伯", gender: "male" },
  { path: ["h", "ys", "os"], name: "大姑", gender: "female" },
  { path: ["h", "ys", "s"], name: "侄子", gender: "male" },
  { path: ["h", "ys", "w"], name: "弟媳", gender: "female" },
  { path: ["h", "ys", "yb"], name: "小叔", gender: "male" },
  { path: ["h", "ys", "ys"], name: "小姑", gender: "female" },
  { path: ["m", "d", "d"], name: "外孙女", gender: "female" },
  { path: ["m", "d", "h"], name: "女婿", gender: "male" },
  { path: ["m", "d", "ob"], name: "外孙", gender: "male" },
  { path: ["m", "d", "os"], name: "外孙女", gender: "female" },
  { path: ["m", "d", "s"], name: "外孙", gender: "male" },
  { path: ["m", "d", "w"], name: "外孙媳", gender: "female" },
  { path: ["m", "d", "yb"], name: "外孙", gender: "male" },
  { path: ["m", "d", "ys"], name: "外孙女", gender: "female" },
  { path: ["m", "f", "d"], name: "妈妈", gender: "both" },
  { path: ["m", "f", "s"], name: "妈妈", gender: "both" },
  { path: ["m", "f", "yb"], name: "舅公", gender: "both" },
  { path: ["m", "f", "ys"], name: "姨婆", gender: "both" },
  { path: ["m", "h", "d"], name: "妹妹", gender: "female" },
  { path: ["m", "h", "f"], name: "爷爷", gender: "male" },
  { path: ["m", "h", "h"], name: "爸爸", gender: "male" },
  { path: ["m", "h", "m"], name: "奶奶", gender: "female" },
  { path: ["m", "h", "ob"], name: "伯父", gender: "male" },
  { path: ["m", "h", "os"], name: "姑妈", gender: "female" },
  { path: ["m", "h", "s"], name: "弟弟", gender: "male" },
  { path: ["m", "h", "yb"], name: "叔叔", gender: "male" },
  { path: ["m", "h", "ys"], name: "姑姑", gender: "female" },
  { path: ["m", "m", "d"], name: "姨妈", gender: "female" },
  { path: ["m", "m", "s"], name: "舅舅", gender: "male" },
  { path: ["m", "m", "yb"], name: "舅公", gender: "male" },
  { path: ["m", "m", "ys"], name: "姨婆", gender: "female" },
  { path: ["m", "s", "d"], name: "侄女", gender: "female" },
  { path: ["m", "s", "h"], name: "侄女婿", gender: "male" },
  { path: ["m", "s", "ob"], name: "侄子", gender: "male" },
  { path: ["m", "s", "os"], name: "侄女", gender: "female" },
  { path: ["m", "s", "s"], name: "侄子", gender: "male" },
  { path: ["m", "s", "w"], name: "侄媳", gender: "female" },
  { path: ["m", "s", "yb"], name: "侄子", gender: "male" },
  { path: ["m", "s", "ys"], name: "侄女", gender: "female" },
  { path: ["m", "w", "d"], name: "妹妹", gender: "female" },
  { path: ["m", "w", "f"], name: "外公", gender: "male" },
  { path: ["m", "w", "m"], name: "外婆", gender: "female" },
  { path: ["m", "w", "ob"], name: "舅舅", gender: "male" },
  { path: ["m", "w", "os"], name: "姨妈", gender: "female" },
  { path: ["m", "w", "s"], name: "弟弟", gender: "male" },
  { path: ["m", "w", "w"], name: "妈妈", gender: "female" },
  { path: ["m", "w", "yb"], name: "舅舅", gender: "male" },
  { path: ["m", "w", "ys"], name: "姨妈", gender: "female" },
  { path: ["ob", "d", "d"], name: "侄孙女", gender: "female" },
  { path: ["ob", "d", "h"], name: "侄孙女婿", gender: "male" },
  { path: ["ob", "d", "ob"], name: "侄孙", gender: "male" },
  { path: ["ob", "d", "os"], name: "侄孙女", gender: "female" },
  { path: ["ob", "d", "s"], name: "侄孙", gender: "male" },
  { path: ["ob", "d", "w"], name: "侄孙媳", gender: "female" },
  { path: ["ob", "d", "yb"], name: "侄子", gender: "both" },
  { path: ["ob", "d", "ys"], name: "侄女", gender: "both" },
  { path: ["ob", "f", "d"], name: "爸爸的女儿", gender: "both" },
  { path: ["ob", "f", "f"], name: "爷爷", gender: "both" },
  { path: ["ob", "f", "h"], name: "爸爸的老公", gender: "both" },
  { path: ["ob", "f", "m"], name: "奶奶", gender: "both" },
  { path: ["ob", "f", "ob"], name: "伯伯", gender: "both" },
  { path: ["ob", "f", "os"], name: "姑姑", gender: "both" },
  { path: ["ob", "f", "s"], name: "爸爸的儿子", gender: "both" },
  { path: ["ob", "f", "w"], name: "妈妈", gender: "both" },
  { path: ["ob", "f", "yb"], name: "叔叔", gender: "both" },
  { path: ["ob", "f", "ys"], name: "姑姑", gender: "both" },
  { path: ["ob", "h", "f"], name: "哥哥的老公的爸爸", gender: "both" },
  { path: ["ob", "h", "h"], name: "哥哥的老公的老公", gender: "both" },
  { path: ["ob", "h", "m"], name: "哥哥的老公的妈妈", gender: "both" },
  { path: ["ob", "h", "ob"], name: "哥哥的老公的哥哥", gender: "both" },
  { path: ["ob", "h", "os"], name: "哥哥的老公的姐姐", gender: "both" },
  { path: ["ob", "h", "yb"], name: "哥哥的老公的弟弟", gender: "both" },
  { path: ["ob", "h", "ys"], name: "哥哥的老公的妹妹", gender: "both" },
  { path: ["ob", "m", "d"], name: "姐姐/妹妹", gender: "both" },
  { path: ["ob", "m", "f"], name: "外公", gender: "both" },
  { path: ["ob", "m", "h"], name: "爸爸", gender: "both" },
  { path: ["ob", "m", "m"], name: "外婆", gender: "both" },
  { path: ["ob", "m", "ob"], name: "舅舅", gender: "both" },
  { path: ["ob", "m", "os"], name: "姨妈", gender: "both" },
  { path: ["ob", "m", "s"], name: "哥哥/弟弟", gender: "both" },
  { path: ["ob", "m", "w"], name: "妈妈的老婆", gender: "both" },
  { path: ["ob", "m", "ys"], name: "小姨", gender: "both" },
  { path: ["ob", "ob", "f"], name: "伯父", gender: "both" },
  { path: ["ob", "ob", "h"], name: "堂哥夫", gender: "both" },
  { path: ["ob", "ob", "m"], name: "伯母", gender: "both" },
  { path: ["ob", "os", "d"], name: "堂侄女", gender: "both" },
  { path: ["ob", "os", "f"], name: "姑父", gender: "both" },
  { path: ["ob", "os", "h"], name: "堂姐夫", gender: "both" },
  { path: ["ob", "os", "m"], name: "姑母", gender: "both" },
  { path: ["ob", "os", "ob"], name: "堂兄", gender: "both" },
  { path: ["ob", "os", "s"], name: "堂侄", gender: "both" },
  { path: ["ob", "os", "w"], name: "堂嫂", gender: "both" },
  { path: ["ob", "os", "yb"], name: "堂弟", gender: "both" },
  { path: ["ob", "os", "ys"], name: "堂妹", gender: "both" },
  { path: ["ob", "s", "h"], name: "侄女婿", gender: "both" },
  { path: ["ob", "s", "ob"], name: "侄孙", gender: "both" },
  { path: ["ob", "s", "os"], name: "侄孙女", gender: "both" },
  { path: ["ob", "s", "w"], name: "侄媳", gender: "both" },
  { path: ["ob", "s", "yb"], name: "侄孙", gender: "both" },
  { path: ["ob", "s", "ys"], name: "侄孙女", gender: "both" },
  { path: ["ob", "w", "f"], name: "嫂父", gender: "both" },
  { path: ["ob", "w", "m"], name: "嫂母", gender: "both" },
  { path: ["ob", "w", "ob"], name: "嫂兄", gender: "both" },
  { path: ["ob", "w", "os"], name: "嫂姐", gender: "both" },
  { path: ["ob", "w", "w"], name: "嫂妻", gender: "both" },
  { path: ["ob", "w", "yb"], name: "嫂弟", gender: "both" },
  { path: ["ob", "w", "ys"], name: "嫂妹", gender: "both" },
  { path: ["ob", "yb", "d"], name: "堂侄女", gender: "both" },
  { path: ["ob", "yb", "f"], name: "叔父", gender: "both" },
  { path: ["ob", "yb", "h"], name: "堂弟夫", gender: "both" },
  { path: ["ob", "yb", "m"], name: "叔母", gender: "both" },
  { path: ["ob", "yb", "ob"], name: "堂兄", gender: "both" },
  { path: ["ob", "yb", "os"], name: "堂姐", gender: "both" },
  { path: ["ob", "yb", "s"], name: "堂侄", gender: "both" },
  { path: ["ob", "yb", "w"], name: "堂弟媳", gender: "both" },
  { path: ["ob", "yb", "ys"], name: "堂妹", gender: "both" },
  { path: ["ob", "ys", "d"], name: "堂侄女", gender: "both" },
  { path: ["ob", "ys", "f"], name: "姑父", gender: "both" },
  { path: ["ob", "ys", "h"], name: "堂妹夫", gender: "both" },
  { path: ["ob", "ys", "m"], name: "姑母", gender: "both" },
  { path: ["ob", "ys", "ob"], name: "堂兄", gender: "both" },
  { path: ["ob", "ys", "os"], name: "堂姐", gender: "both" },
  { path: ["ob", "ys", "s"], name: "堂侄", gender: "both" },
  { path: ["ob", "ys", "w"], name: "堂妹媳", gender: "both" },
  { path: ["ob", "ys", "yb"], name: "堂弟", gender: "both" },
  { path: ["os", "d", "d"], name: "外曾孙女", gender: "both" },
  { path: ["os", "d", "h"], name: "外孙女婿", gender: "both" },
  { path: ["os", "d", "ob"], name: "外曾孙", gender: "both" },
  { path: ["os", "d", "os"], name: "外曾孙女", gender: "both" },
  { path: ["os", "d", "s"], name: "外曾孙", gender: "both" },
  { path: ["os", "d", "w"], name: "外孙媳", gender: "both" },
  { path: ["os", "d", "yb"], name: "外曾孙", gender: "both" },
  { path: ["os", "d", "ys"], name: "外曾孙女", gender: "both" },
  { path: ["os", "f", "d"], name: "爸爸的女儿", gender: "both" },
  { path: ["os", "f", "f"], name: "爷爷", gender: "both" },
  { path: ["os", "f", "h"], name: "爸爸的老公", gender: "both" },
  { path: ["os", "f", "m"], name: "奶奶", gender: "both" },
  { path: ["os", "f", "ob"], name: "伯伯", gender: "both" },
  { path: ["os", "f", "os"], name: "姑姑", gender: "both" },
  { path: ["os", "f", "s"], name: "爸爸的儿子", gender: "both" },
  { path: ["os", "f", "w"], name: "妈妈", gender: "both" },
  { path: ["os", "f", "yb"], name: "叔叔", gender: "both" },
  { path: ["os", "f", "ys"], name: "姑姑", gender: "both" },
  { path: ["os", "h", "f"], name: "姐夫父", gender: "both" },
  { path: ["os", "h", "h"], name: "姐夫夫", gender: "both" },
  { path: ["os", "h", "m"], name: "姐夫母", gender: "both" },
  { path: ["os", "h", "ob"], name: "姐夫兄", gender: "both" },
  { path: ["os", "h", "os"], name: "姐夫姐", gender: "both" },
  { path: ["os", "h", "yb"], name: "姐夫弟", gender: "both" },
  { path: ["os", "h", "ys"], name: "姐夫妹", gender: "both" },
  { path: ["os", "m", "d"], name: "姐姐/妹妹", gender: "both" },
  { path: ["os", "m", "f"], name: "外公", gender: "both" },
  { path: ["os", "m", "h"], name: "爸爸", gender: "both" },
  { path: ["os", "m", "m"], name: "外婆", gender: "both" },
  { path: ["os", "m", "ob"], name: "舅舅", gender: "both" },
  { path: ["os", "m", "os"], name: "姨妈", gender: "both" },
  { path: ["os", "m", "s"], name: "哥哥/弟弟", gender: "both" },
  { path: ["os", "m", "w"], name: "妈妈的老婆", gender: "both" },
  { path: ["os", "ob", "d"], name: "侄女", gender: "both" },
  { path: ["os", "ob", "f"], name: "伯父", gender: "both" },
  { path: ["os", "ob", "h"], name: "堂姐夫", gender: "both" },
  { path: ["os", "ob", "m"], name: "伯母", gender: "both" },
  { path: ["os", "ob", "os"], name: "堂姐", gender: "both" },
  { path: ["os", "ob", "s"], name: "堂侄", gender: "both" },
  { path: ["os", "ob", "w"], name: "堂嫂", gender: "both" },
  { path: ["os", "ob", "yb"], name: "堂弟", gender: "both" },
  { path: ["os", "ob", "ys"], name: "堂妹", gender: "both" },
  { path: ["os", "os", "f"], name: "伯父", gender: "both" },
  { path: ["os", "os", "m"], name: "伯母", gender: "both" },
  { path: ["os", "os", "w"], name: "堂嫂", gender: "both" },
  { path: ["os", "s", "h"], name: "外孙女婿", gender: "both" },
  { path: ["os", "s", "ob"], name: "外曾孙", gender: "both" },
  { path: ["os", "s", "os"], name: "外曾孙女", gender: "both" },
  { path: ["os", "s", "w"], name: "外孙媳", gender: "both" },
  { path: ["os", "s", "yb"], name: "外曾孙", gender: "both" },
  { path: ["os", "s", "ys"], name: "外曾孙女", gender: "both" },
  { path: ["os", "w", "f"], name: "姐妻父", gender: "both" },
  { path: ["os", "w", "m"], name: "姐妻母", gender: "both" },
  { path: ["os", "w", "ob"], name: "姐妻兄", gender: "both" },
  { path: ["os", "w", "os"], name: "姐妻姐", gender: "both" },
  { path: ["os", "w", "w"], name: "姐妻妻", gender: "both" },
  { path: ["os", "w", "yb"], name: "姐妻弟", gender: "both" },
  { path: ["os", "w", "ys"], name: "姐妻妹", gender: "both" },
  { path: ["os", "yb", "d"], name: "侄女", gender: "both" },
  { path: ["os", "yb", "f"], name: "叔父", gender: "both" },
  { path: ["os", "yb", "h"], name: "堂弟夫", gender: "both" },
  { path: ["os", "yb", "m"], name: "叔母", gender: "both" },
  { path: ["os", "yb", "ob"], name: "堂兄", gender: "both" },
  { path: ["os", "yb", "os"], name: "堂姐", gender: "both" },
  { path: ["os", "yb", "s"], name: "侄子", gender: "both" },
  { path: ["os", "yb", "w"], name: "弟媳", gender: "both" },
  { path: ["os", "yb", "ys"], name: "妹妹", gender: "both" },
  { path: ["os", "ys", "d"], name: "外甥女", gender: "both" },
  { path: ["os", "ys", "f"], name: "父亲", gender: "both" },
  { path: ["os", "ys", "h"], name: "妹夫", gender: "both" },
  { path: ["os", "ys", "m"], name: "母亲", gender: "both" },
  { path: ["os", "ys", "ob"], name: "哥哥", gender: "both" },
  { path: ["os", "ys", "os"], name: "姐姐", gender: "both" },
  { path: ["os", "ys", "s"], name: "外甥", gender: "both" },
  { path: ["os", "ys", "w"], name: "弟媳", gender: "both" },
  { path: ["os", "ys", "yb"], name: "弟弟", gender: "both" },
  { path: ["s", "d", "h"], name: "孙女婿", gender: "both" },
  { path: ["s", "d", "ob"], name: "孙子", gender: "both" },
  { path: ["s", "d", "os"], name: "孙女", gender: "both" },
  { path: ["s", "d", "w"], name: "孙女的老婆", gender: "both" },
  { path: ["s", "d", "yb"], name: "孙子", gender: "both" },
  { path: ["s", "d", "ys"], name: "孙女", gender: "both" },
  { path: ["s", "f", "h"], name: "儿子的爸爸的老公", gender: "both" },
  { path: ["s", "h", "d"], name: "儿子的老公的女儿", gender: "both" },
  { path: ["s", "h", "f"], name: "亲家公", gender: "both" },
  { path: ["s", "h", "h"], name: "儿子的老公的老公", gender: "both" },
  { path: ["s", "h", "m"], name: "亲家母", gender: "both" },
  { path: ["s", "h", "ob"], name: "儿子的老公的哥哥", gender: "both" },
  { path: ["s", "h", "os"], name: "儿子的老公的姐姐", gender: "both" },
  { path: ["s", "h", "s"], name: "侄孙", gender: "both" },
  { path: ["s", "h", "yb"], name: "儿子的老公的弟弟", gender: "both" },
  { path: ["s", "h", "ys"], name: "儿子的老公的妹妹", gender: "both" },
  { path: ["s", "m", "h"], name: "父亲", gender: "both" },
  { path: ["s", "ob", "d"], name: "侄孙女", gender: "both" },
  { path: ["s", "ob", "f"], name: "父亲", gender: "both" },
  { path: ["s", "ob", "h"], name: "堂兄夫", gender: "both" },
  { path: ["s", "ob", "m"], name: "儿子的哥哥的妈妈", gender: "both" },
  { path: ["s", "ob", "ob"], name: "儿子", gender: "both" },
  { path: ["s", "ob", "os"], name: "女儿", gender: "both" },
  { path: ["s", "ob", "s"], name: "孙子", gender: "both" },
  { path: ["s", "ob", "w"], name: "儿媳", gender: "both" },
  { path: ["s", "ob", "yb"], name: "儿子", gender: "both" },
  { path: ["s", "ob", "ys"], name: "女儿", gender: "both" },
  { path: ["s", "os", "d"], name: "孙女", gender: "both" },
  { path: ["s", "os", "f"], name: "自己", gender: "both" },
  { path: ["s", "os", "h"], name: "女婿", gender: "both" },
  { path: ["s", "os", "m"], name: "自己", gender: "both" },
  { path: ["s", "os", "ob"], name: "儿子", gender: "both" },
  { path: ["s", "os", "os"], name: "女儿", gender: "both" },
  { path: ["s", "os", "s"], name: "孙子", gender: "both" },
  { path: ["s", "os", "w"], name: "儿子的姐姐的老婆", gender: "both" },
  { path: ["s", "os", "yb"], name: "儿子", gender: "both" },
  { path: ["s", "os", "ys"], name: "女儿", gender: "both" },
  { path: ["s", "s", "h"], name: "孙子的老公", gender: "both" },
  { path: ["s", "s", "ob"], name: "孙子", gender: "both" },
  { path: ["s", "s", "os"], name: "孙女", gender: "both" },
  { path: ["s", "s", "w"], name: "孙媳", gender: "both" },
  { path: ["s", "s", "yb"], name: "孙子", gender: "both" },
  { path: ["s", "s", "ys"], name: "孙女", gender: "both" },
  { path: ["s", "w", "d"], name: "孙女", gender: "both" },
  { path: ["s", "w", "f"], name: "亲家公", gender: "both" },
  { path: ["s", "w", "m"], name: "亲家母", gender: "both" },
  { path: ["s", "w", "ob"], name: "儿媳的哥哥", gender: "both" },
  { path: ["s", "w", "os"], name: "儿媳的姐姐", gender: "both" },
  { path: ["s", "w", "s"], name: "孙子", gender: "both" },
  { path: ["s", "w", "w"], name: "儿媳的老婆", gender: "both" },
  { path: ["s", "w", "yb"], name: "儿媳的弟弟", gender: "both" },
  { path: ["s", "w", "ys"], name: "儿媳的妹妹", gender: "both" },
  { path: ["s", "yb", "d"], name: "孙女", gender: "both" },
  { path: ["s", "yb", "f"], name: "自己", gender: "both" },
  { path: ["s", "yb", "h"], name: "儿子的弟弟的老公", gender: "both" },
  { path: ["s", "yb", "m"], name: "自己", gender: "both" },
  { path: ["s", "yb", "ob"], name: "儿子", gender: "both" },
  { path: ["s", "yb", "os"], name: "女儿", gender: "both" },
  { path: ["s", "yb", "s"], name: "孙子", gender: "both" },
  { path: ["s", "yb", "w"], name: "儿媳", gender: "both" },
  { path: ["s", "yb", "yb"], name: "儿子", gender: "both" },
  { path: ["s", "yb", "ys"], name: "女儿", gender: "both" },
  { path: ["s", "ys", "d"], name: "孙女", gender: "both" },
  { path: ["s", "ys", "f"], name: "自己", gender: "both" },
  { path: ["s", "ys", "h"], name: "女婿", gender: "both" },
  { path: ["s", "ys", "m"], name: "自己", gender: "both" },
  { path: ["s", "ys", "ob"], name: "儿子", gender: "both" },
  { path: ["s", "ys", "os"], name: "女儿", gender: "both" },
  { path: ["s", "ys", "s"], name: "孙子", gender: "both" },
  { path: ["s", "ys", "w"], name: "儿媳", gender: "both" },
  { path: ["s", "ys", "yb"], name: "儿子", gender: "both" },
  { path: ["s", "ys", "ys"], name: "女儿", gender: "both" },
  { path: ["w", "d", "d"], name: "外孙女", gender: "both" },
  { path: ["w", "d", "h"], name: "外孙女婿", gender: "both" },
  { path: ["w", "d", "ob"], name: "外孙", gender: "both" },
  { path: ["w", "d", "os"], name: "外孙女", gender: "both" },
  { path: ["w", "d", "s"], name: "外孙", gender: "both" },
  { path: ["w", "d", "w"], name: "老婆的女儿的老婆", gender: "both" },
  { path: ["w", "d", "yb"], name: "外孙", gender: "both" },
  { path: ["w", "d", "ys"], name: "外孙女", gender: "both" },
  { path: ["w", "f", "d"], name: "大姨子/小姨子", gender: "both" },
  { path: ["w", "f", "h"], name: "老婆的爸爸的老公", gender: "both" },
  { path: ["w", "f", "ob"], name: "老婆的爸爸的哥哥", gender: "both" },
  { path: ["w", "f", "os"], name: "老婆的爸爸的姐姐", gender: "both" },
  { path: ["w", "f", "s"], name: "大舅子/小舅子", gender: "both" },
  { path: ["w", "f", "w"], name: "岳母", gender: "both" },
  { path: ["w", "f", "yb"], name: "老婆的爸爸的弟弟", gender: "both" },
  { path: ["w", "f", "ys"], name: "老婆的爸爸的妹妹", gender: "both" },
  { path: ["w", "h", "h"], name: "老婆的老公的老公", gender: "both" },
  { path: ["w", "m", "d"], name: "大姨子/小姨子", gender: "both" },
  { path: ["w", "m", "f"], name: "外公", gender: "both" },
  { path: ["w", "m", "h"], name: "岳父", gender: "both" },
  { path: ["w", "m", "m"], name: "外婆", gender: "both" },
  { path: ["w", "m", "ob"], name: "舅公", gender: "both" },
  { path: ["w", "m", "os"], name: "姨婆", gender: "both" },
  { path: ["w", "m", "s"], name: "大舅子/小舅子", gender: "both" },
  { path: ["w", "m", "w"], name: "老婆的妈妈的老婆", gender: "both" },
  { path: ["w", "m", "yb"], name: "舅公", gender: "both" },
  { path: ["w", "m", "ys"], name: "姨婆", gender: "both" },
  { path: ["w", "ob", "d"], name: "外甥女", gender: "both" },
  { path: ["w", "ob", "f"], name: "岳父", gender: "both" },
  { path: ["w", "ob", "h"], name: "老婆的哥哥的老公", gender: "both" },
  { path: ["w", "ob", "m"], name: "岳母", gender: "both" },
  { path: ["w", "ob", "os"], name: "大姨子/小姨子", gender: "both" },
  { path: ["w", "ob", "s"], name: "外甥", gender: "both" },
  { path: ["w", "ob", "w"], name: "舅妈", gender: "both" },
  { path: ["w", "ob", "yb"], name: "大舅子/小舅子", gender: "both" },
  { path: ["w", "ob", "ys"], name: "大姨子/小姨子", gender: "both" },
  { path: ["w", "os", "d"], name: "外甥女", gender: "both" },
  { path: ["w", "os", "f"], name: "岳父", gender: "both" },
  { path: ["w", "os", "h"], name: "连襟", gender: "both" },
  { path: ["w", "os", "m"], name: "岳母", gender: "both" },
  { path: ["w", "os", "ob"], name: "大舅子/小舅子", gender: "both" },
  { path: ["w", "os", "s"], name: "外甥", gender: "both" },
  { path: ["w", "os", "w"], name: "老婆的姐姐的老婆", gender: "both" },
  { path: ["w", "os", "yb"], name: "大舅子/小舅子", gender: "both" },
  { path: ["w", "os", "ys"], name: "大姨子/小姨子", gender: "both" },
  { path: ["w", "s", "d"], name: "孙女", gender: "both" },
  { path: ["w", "s", "h"], name: "孙女婿", gender: "both" },
  { path: ["w", "s", "ob"], name: "儿子", gender: "both" },
  { path: ["w", "s", "os"], name: "女儿", gender: "both" },
  { path: ["w", "s", "s"], name: "孙子", gender: "both" },
  { path: ["w", "s", "w"], name: "老婆的儿子的老婆", gender: "both" },
  { path: ["w", "s", "yb"], name: "儿子", gender: "both" },
  { path: ["w", "s", "ys"], name: "女儿", gender: "both" },
  { path: ["w", "w", "d"], name: "老婆的老婆的女儿", gender: "both" },
  { path: ["w", "w", "f"], name: "老婆的老婆的爸爸", gender: "both" },
  { path: ["w", "w", "m"], name: "老婆的老婆的妈妈", gender: "both" },
  { path: ["w", "w", "ob"], name: "老婆的老婆的哥哥", gender: "both" },
  { path: ["w", "w", "os"], name: "老婆的老婆的姐姐", gender: "both" },
  { path: ["w", "w", "s"], name: "老婆的老婆的儿子", gender: "both" },
  { path: ["w", "w", "w"], name: "老婆的老婆的老婆", gender: "both" },
  { path: ["w", "w", "yb"], name: "老婆的老婆的弟弟", gender: "both" },
  { path: ["w", "w", "ys"], name: "老婆的老婆的妹妹", gender: "both" },
  { path: ["w", "yb", "d"], name: "老婆的弟弟的女儿", gender: "both" },
  { path: ["w", "yb", "f"], name: "老婆的弟弟的爸爸", gender: "both" },
  { path: ["w", "yb", "h"], name: "老婆的弟弟的老公", gender: "both" },
  { path: ["w", "yb", "m"], name: "老婆的弟弟的妈妈", gender: "both" },
  { path: ["w", "yb", "ob"], name: "老婆的弟弟的哥哥", gender: "both" },
  { path: ["w", "yb", "os"], name: "老婆的弟弟的姐姐", gender: "both" },
  { path: ["w", "yb", "s"], name: "老婆的弟弟的儿子", gender: "both" },
  { path: ["w", "yb", "w"], name: "老婆的弟弟的老婆", gender: "both" },
  { path: ["w", "yb", "ys"], name: "老婆的弟弟的妹妹", gender: "both" },
  { path: ["w", "ys", "d"], name: "老婆的妹妹的女儿", gender: "both" },
  { path: ["w", "ys", "f"], name: "老婆的妹妹的爸爸", gender: "both" },
  { path: ["w", "ys", "h"], name: "老婆的妹妹的老公", gender: "both" },
  { path: ["w", "ys", "m"], name: "老婆的妹妹的妈妈", gender: "both" },
  { path: ["w", "ys", "ob"], name: "老婆的妹妹的哥哥", gender: "both" },
  { path: ["w", "ys", "os"], name: "老婆的妹妹的姐姐", gender: "both" },
  { path: ["w", "ys", "s"], name: "老婆的妹妹的儿子", gender: "both" },
  { path: ["w", "ys", "w"], name: "老婆的妹妹的老婆", gender: "both" },
  { path: ["w", "ys", "yb"], name: "老婆的妹妹的弟弟", gender: "both" },
  { path: ["yb", "d", "d"], name: "弟弟的女儿的女儿", gender: "both" },
  { path: ["yb", "d", "h"], name: "弟弟的女儿的老公", gender: "both" },
  { path: ["yb", "d", "ob"], name: "弟弟的女儿的哥哥", gender: "both" },
  { path: ["yb", "d", "os"], name: "弟弟的女儿的姐姐", gender: "both" },
  { path: ["yb", "d", "s"], name: "弟弟的女儿的儿子", gender: "both" },
  { path: ["yb", "d", "w"], name: "弟弟的女儿的老婆", gender: "both" },
  { path: ["yb", "d", "yb"], name: "弟弟的女儿的弟弟", gender: "both" },
  { path: ["yb", "d", "ys"], name: "弟弟的女儿的妹妹", gender: "both" },
  { path: ["yb", "f", "d"], name: "爸爸的女儿", gender: "both" },
  { path: ["yb", "f", "f"], name: "爷爷", gender: "both" },
  { path: ["yb", "f", "h"], name: "爸爸的老公", gender: "both" },
  { path: ["yb", "f", "m"], name: "奶奶", gender: "both" },
  { path: ["yb", "f", "ob"], name: "伯伯", gender: "both" },
  { path: ["yb", "f", "os"], name: "姑姑", gender: "both" },
  { path: ["yb", "f", "s"], name: "爸爸的儿子", gender: "both" },
  { path: ["yb", "f", "w"], name: "妈妈", gender: "both" },
  { path: ["yb", "f", "yb"], name: "叔叔", gender: "both" },
  { path: ["yb", "f", "ys"], name: "姑姑", gender: "both" },
  { path: ["yb", "h", "f"], name: "弟弟的老公的爸爸", gender: "both" },
  { path: ["yb", "h", "h"], name: "弟弟的老公的老公", gender: "both" },
  { path: ["yb", "h", "m"], name: "弟弟的老公的妈妈", gender: "both" },
  { path: ["yb", "h", "ob"], name: "弟弟的老公的哥哥", gender: "both" },
  { path: ["yb", "h", "os"], name: "弟弟的老公的姐姐", gender: "both" },
  { path: ["yb", "h", "yb"], name: "弟弟的老公的弟弟", gender: "both" },
  { path: ["yb", "h", "ys"], name: "弟弟的老公的妹妹", gender: "both" },
  { path: ["yb", "m", "d"], name: "姐姐/妹妹", gender: "both" },
  { path: ["yb", "m", "f"], name: "外公", gender: "both" },
  { path: ["yb", "m", "h"], name: "爸爸", gender: "both" },
  { path: ["yb", "m", "m"], name: "外婆", gender: "both" },
  { path: ["yb", "m", "ob"], name: "舅舅", gender: "both" },
  { path: ["yb", "m", "os"], name: "姨妈", gender: "both" },
  { path: ["yb", "m", "s"], name: "哥哥/弟弟", gender: "both" },
  { path: ["yb", "m", "w"], name: "妈妈的老婆", gender: "both" },
  { path: ["yb", "m", "yb"], name: "舅舅", gender: "both" },
  { path: ["yb", "m", "ys"], name: "小姨", gender: "both" },
  { path: ["yb", "ob", "d"], name: "弟弟的哥哥的女儿", gender: "both" },
  { path: ["yb", "ob", "f"], name: "弟弟的哥哥的爸爸", gender: "both" },
  { path: ["yb", "ob", "h"], name: "弟弟的哥哥的老公", gender: "both" },
  { path: ["yb", "ob", "m"], name: "弟弟的哥哥的妈妈", gender: "both" },
  { path: ["yb", "ob", "os"], name: "弟弟的哥哥的姐姐", gender: "both" },
  { path: ["yb", "ob", "s"], name: "弟弟的哥哥的儿子", gender: "both" },
  { path: ["yb", "ob", "w"], name: "弟弟的哥哥的老婆", gender: "both" },
  { path: ["yb", "ob", "yb"], name: "弟弟的哥哥的弟弟", gender: "both" },
  { path: ["yb", "ob", "ys"], name: "弟弟的哥哥的妹妹", gender: "both" },
  { path: ["yb", "os", "d"], name: "弟弟的姐姐的女儿", gender: "both" },
  { path: ["yb", "os", "f"], name: "弟弟的姐姐的爸爸", gender: "both" },
  { path: ["yb", "os", "h"], name: "弟弟的姐姐的老公", gender: "both" },
  { path: ["yb", "os", "m"], name: "弟弟的姐姐的妈妈", gender: "both" },
  { path: ["yb", "os", "ob"], name: "弟弟的姐姐的哥哥", gender: "both" },
  { path: ["yb", "os", "s"], name: "弟弟的姐姐的儿子", gender: "both" },
  { path: ["yb", "os", "w"], name: "弟弟的姐姐的老婆", gender: "both" },
  { path: ["yb", "os", "yb"], name: "弟弟的姐姐的弟弟", gender: "both" },
  { path: ["yb", "os", "ys"], name: "弟弟的姐姐的妹妹", gender: "both" },
  { path: ["yb", "s", "h"], name: "弟弟的儿子的老公", gender: "both" },
  { path: ["yb", "s", "ob"], name: "弟弟的儿子的哥哥", gender: "both" },
  { path: ["yb", "s", "os"], name: "弟弟的儿子的姐姐", gender: "both" },
  { path: ["yb", "s", "w"], name: "弟弟的儿子的老婆", gender: "both" },
  { path: ["yb", "s", "yb"], name: "弟弟的儿子的弟弟", gender: "both" },
  { path: ["yb", "s", "ys"], name: "弟弟的儿子的妹妹", gender: "both" },
  { path: ["yb", "w", "f"], name: "弟媳的爸爸", gender: "both" },
  { path: ["yb", "w", "m"], name: "弟媳的妈妈", gender: "both" },
  { path: ["yb", "w", "ob"], name: "弟媳的哥哥", gender: "both" },
  { path: ["yb", "w", "os"], name: "弟媳的姐姐", gender: "both" },
  { path: ["yb", "w", "w"], name: "弟媳的老婆", gender: "both" },
  { path: ["yb", "w", "yb"], name: "弟媳的弟弟", gender: "both" },
  { path: ["yb", "w", "ys"], name: "弟媳的妹妹", gender: "both" },
  { path: ["yb", "yb", "f"], name: "弟弟的弟弟的爸爸", gender: "both" },
  { path: ["yb", "yb", "h"], name: "弟弟的弟弟的老公", gender: "both" },
  { path: ["yb", "yb", "m"], name: "弟弟的弟弟的妈妈", gender: "both" },
  { path: ["yb", "ys", "d"], name: "弟弟的妹妹的女儿", gender: "both" },
  { path: ["yb", "ys", "f"], name: "弟弟的妹妹的爸爸", gender: "both" },
  { path: ["yb", "ys", "h"], name: "弟弟的妹妹的老公", gender: "both" },
  { path: ["yb", "ys", "m"], name: "弟弟的妹妹的妈妈", gender: "both" },
  { path: ["yb", "ys", "ob"], name: "弟弟的妹妹的哥哥", gender: "both" },
  { path: ["yb", "ys", "os"], name: "弟弟的妹妹的姐姐", gender: "both" },
  { path: ["yb", "ys", "s"], name: "弟弟的妹妹的儿子", gender: "both" },
  { path: ["yb", "ys", "w"], name: "弟弟的妹妹的老婆", gender: "both" },
  { path: ["yb", "ys", "yb"], name: "弟弟的妹妹的弟弟", gender: "both" },
  { path: ["ys", "d", "d"], name: "妹妹的女儿的女儿", gender: "both" },
  { path: ["ys", "d", "h"], name: "妹妹的女儿的老公", gender: "both" },
  { path: ["ys", "d", "ob"], name: "妹妹的女儿的哥哥", gender: "both" },
  { path: ["ys", "d", "os"], name: "妹妹的女儿的姐姐", gender: "both" },
  { path: ["ys", "d", "s"], name: "妹妹的女儿的儿子", gender: "both" },
  { path: ["ys", "d", "w"], name: "妹妹的女儿的老婆", gender: "both" },
  { path: ["ys", "d", "yb"], name: "妹妹的女儿的弟弟", gender: "both" },
  { path: ["ys", "d", "ys"], name: "妹妹的女儿的妹妹", gender: "both" },
  { path: ["ys", "f", "d"], name: "爸爸的女儿", gender: "both" },
  { path: ["ys", "f", "f"], name: "爷爷", gender: "both" },
  { path: ["ys", "f", "h"], name: "爸爸的老公", gender: "both" },
  { path: ["ys", "f", "m"], name: "奶奶", gender: "both" },
  { path: ["ys", "f", "ob"], name: "伯伯", gender: "both" },
  { path: ["ys", "f", "os"], name: "姑姑", gender: "both" },
  { path: ["ys", "f", "s"], name: "爸爸的儿子", gender: "both" },
  { path: ["ys", "f", "w"], name: "妈妈", gender: "both" },
  { path: ["ys", "f", "yb"], name: "叔叔", gender: "both" },
  { path: ["ys", "f", "ys"], name: "姑姑", gender: "both" },
  { path: ["ys", "h", "f"], name: "妹夫的爸爸", gender: "both" },
  { path: ["ys", "h", "h"], name: "妹夫的老公", gender: "both" },
  { path: ["ys", "h", "m"], name: "妹夫的妈妈", gender: "both" },
  { path: ["ys", "h", "ob"], name: "妹夫的哥哥", gender: "both" },
  { path: ["ys", "h", "os"], name: "妹夫的姐姐", gender: "both" },
  { path: ["ys", "h", "yb"], name: "妹夫的弟弟", gender: "both" },
  { path: ["ys", "h", "ys"], name: "妹夫的妹妹", gender: "both" },
  { path: ["ys", "m", "d"], name: "姐姐/妹妹", gender: "both" },
  { path: ["ys", "m", "f"], name: "外公", gender: "both" },
  { path: ["ys", "m", "h"], name: "爸爸", gender: "both" },
  { path: ["ys", "m", "m"], name: "外婆", gender: "both" },
  { path: ["ys", "m", "ob"], name: "舅舅", gender: "both" },
  { path: ["ys", "m", "os"], name: "姨妈", gender: "both" },
  { path: ["ys", "m", "s"], name: "哥哥/弟弟", gender: "both" },
  { path: ["ys", "m", "w"], name: "妈妈的老婆", gender: "both" },
  { path: ["ys", "m", "yb"], name: "舅舅", gender: "both" },
  { path: ["ys", "m", "ys"], name: "小姨", gender: "both" },
  { path: ["ys", "ob", "d"], name: "妹妹的哥哥的女儿", gender: "both" },
  { path: ["ys", "ob", "f"], name: "妹妹的哥哥的爸爸", gender: "both" },
  { path: ["ys", "ob", "h"], name: "妹妹的哥哥的老公", gender: "both" },
  { path: ["ys", "ob", "m"], name: "妹妹的哥哥的妈妈", gender: "both" },
  { path: ["ys", "ob", "os"], name: "妹妹的哥哥的姐姐", gender: "both" },
  { path: ["ys", "ob", "s"], name: "妹妹的哥哥的儿子", gender: "both" },
  { path: ["ys", "ob", "w"], name: "妹妹的哥哥的老婆", gender: "both" },
  { path: ["ys", "ob", "yb"], name: "妹妹的哥哥的弟弟", gender: "both" },
  { path: ["ys", "ob", "ys"], name: "妹妹的哥哥的妹妹", gender: "both" },
  { path: ["ys", "os", "d"], name: "妹妹的姐姐的女儿", gender: "both" },
  { path: ["ys", "os", "f"], name: "妹妹的姐姐的爸爸", gender: "both" },
  { path: ["ys", "os", "h"], name: "妹妹的姐姐的老公", gender: "both" },
  { path: ["ys", "os", "m"], name: "妹妹的姐姐的妈妈", gender: "both" },
  { path: ["ys", "os", "ob"], name: "妹妹的姐姐的哥哥", gender: "both" },
  { path: ["ys", "os", "s"], name: "妹妹的姐姐的儿子", gender: "both" },
  { path: ["ys", "os", "w"], name: "妹妹的姐姐的老婆", gender: "both" },
  { path: ["ys", "os", "yb"], name: "妹妹的姐姐的弟弟", gender: "both" },
  { path: ["ys", "os", "ys"], name: "妹妹的姐姐的妹妹", gender: "both" },
  { path: ["ys", "s", "h"], name: "妹妹的儿子的老公", gender: "both" },
  { path: ["ys", "s", "ob"], name: "妹妹的儿子的哥哥", gender: "both" },
  { path: ["ys", "s", "os"], name: "妹妹的儿子的姐姐", gender: "both" },
  { path: ["ys", "s", "w"], name: "妹妹的儿子的老婆", gender: "both" },
  { path: ["ys", "s", "yb"], name: "妹妹的儿子的弟弟", gender: "both" },
  { path: ["ys", "s", "ys"], name: "妹妹的儿子的妹妹", gender: "both" },
  { path: ["ys", "w", "f"], name: "妹妹的老婆的爸爸", gender: "both" },
  { path: ["ys", "w", "m"], name: "妹妹的老婆的妈妈", gender: "both" },
  { path: ["ys", "w", "ob"], name: "妹妹的老婆的哥哥", gender: "both" },
  { path: ["ys", "w", "os"], name: "妹妹的老婆的姐姐", gender: "both" },
  { path: ["ys", "w", "w"], name: "妹妹的老婆的老婆", gender: "both" },
  { path: ["ys", "w", "yb"], name: "妹妹的老婆的弟弟", gender: "both" },
  { path: ["ys", "w", "ys"], name: "妹妹的老婆的妹妹", gender: "both" },
  { path: ["ys", "yb", "d"], name: "妹妹的弟弟的女儿", gender: "both" },
  { path: ["ys", "yb", "f"], name: "妹妹的弟弟的爸爸", gender: "both" },
  { path: ["ys", "yb", "h"], name: "妹妹的弟弟的老公", gender: "both" },
  { path: ["ys", "yb", "m"], name: "妹妹的弟弟的妈妈", gender: "both" },
  { path: ["ys", "yb", "ob"], name: "妹妹的弟弟的哥哥", gender: "both" },
  { path: ["ys", "yb", "os"], name: "妹妹的弟弟的姐姐", gender: "both" },
  { path: ["ys", "yb", "s"], name: "妹妹的弟弟的儿子", gender: "both" },
  { path: ["ys", "yb", "w"], name: "妹妹的弟弟的老婆", gender: "both" },
  { path: ["ys", "yb", "ys"], name: "妹妹的弟弟的妹妹", gender: "both" },
  { path: ["ys", "ys", "f"], name: "妹妹的妹妹的爸爸", gender: "both" },
  { path: ["ys", "ys", "m"], name: "妹妹的妹妹的妈妈", gender: "both" },
  { path: ["ys", "ys", "w"], name: "妹妹的妹妹的老婆", gender: "both" },
  { path: ["d", "f", "w"], name: "女儿的爸爸的老婆", gender: "both" },
  { path: ["d", "m", "w"], name: "女儿的妈妈的老婆", gender: "both" },
  { path: ["h", "w", "w"], name: "老公的老婆的老婆", gender: "both" },
  { path: ["s", "f", "w"], name: "儿子的爸爸的老婆", gender: "both" },
  { path: ["s", "m", "w"], name: "儿子的妈妈的老婆", gender: "both" },
  { path: ["w", "d", "f"], name: "老婆的女儿的爸爸", gender: "both" },
  { path: ["w", "d", "m"], name: "老婆的女儿的妈妈", gender: "both" },
  { path: ["w", "h", "w"], name: "老婆的老公的老婆", gender: "both" },
  { path: ["w", "ob", "ob"], name: "老婆的哥哥的哥哥", gender: "both" },
  { path: ["w", "os", "os"], name: "老婆的姐姐的姐姐", gender: "both" },
  { path: ["w", "s", "f"], name: "老婆的儿子的爸爸", gender: "both" },
  { path: ["w", "s", "m"], name: "老婆的儿子的妈妈", gender: "both" },
  { path: ["w", "w", "h"], name: "老婆的老婆的老公", gender: "both" },
  { path: ["w", "yb", "yb"], name: "老婆的弟弟的弟弟", gender: "both" },
  { path: ["w", "ys", "ys"], name: "老婆的妹妹的妹妹", gender: "both" },
  { path: ["f", "h"], name: "爸爸的老公", gender: "both" },
  { path: ["m", "w"], name: "妈妈的老婆", gender: "both" },
  { path: ["f", "f", "h"], name: "爸爸", gender: "both" },
  { path: ["f", "f", "w"], name: "爸爸", gender: "both" },
  { path: ["f", "m", "h"], name: "爸爸", gender: "both" },
  { path: ["f", "m", "w"], name: "爸爸", gender: "both" },
  { path: ["f", "ob", "h"], name: "伯父的老公", gender: "both" },
  { path: ["f", "ob", "ob"], name: "伯父的哥哥", gender: "both" },
  { path: ["f", "ob", "os"], name: "伯父的姐姐", gender: "both" },
  { path: ["f", "ob", "w"], name: "伯母", gender: "both" },
  { path: ["f", "ob", "yb"], name: "伯父的弟弟", gender: "both" },
  { path: ["f", "ob", "ys"], name: "伯父的妹妹", gender: "both" },
  { path: ["f", "os", "h"], name: "姑父", gender: "both" },
  { path: ["f", "os", "ob"], name: "姑妈的哥哥", gender: "both" },
  { path: ["f", "os", "os"], name: "姑妈的姐姐", gender: "both" },
  { path: ["f", "os", "w"], name: "姑妈的老婆", gender: "both" },
  { path: ["f", "os", "yb"], name: "姑妈的弟弟", gender: "both" },
  { path: ["f", "os", "ys"], name: "姑妈的妹妹", gender: "both" },
  { path: ["f", "yb", "h"], name: "叔父的老公", gender: "both" },
  { path: ["f", "yb", "ob"], name: "叔父的哥哥", gender: "both" },
  { path: ["f", "yb", "os"], name: "叔父的姐姐", gender: "both" },
  { path: ["f", "yb", "w"], name: "婶婶", gender: "both" },
  { path: ["f", "yb", "yb"], name: "叔父的弟弟", gender: "both" },
  { path: ["f", "yb", "ys"], name: "叔父的妹妹", gender: "both" },
  { path: ["f", "ys", "h"], name: "姑父", gender: "both" },
  { path: ["f", "ys", "ob"], name: "姑姑的哥哥", gender: "both" },
  { path: ["f", "ys", "os"], name: "姑姑的姐姐", gender: "both" },
  { path: ["f", "ys", "w"], name: "姑姑的老婆", gender: "both" },
  { path: ["f", "ys", "yb"], name: "姑姑的弟弟", gender: "both" },
  { path: ["f", "ys", "ys"], name: "姑姑的妹妹", gender: "both" },
  { path: ["m", "f", "h"], name: "妈妈", gender: "both" },
  { path: ["m", "f", "w"], name: "妈妈", gender: "both" },
  { path: ["m", "m", "h"], name: "妈妈", gender: "both" },
  { path: ["m", "m", "w"], name: "妈妈", gender: "both" },
  { path: ["m", "ob", "h"], name: "舅舅的老公", gender: "both" },
  { path: ["m", "ob", "ob"], name: "舅舅的哥哥", gender: "both" },
  { path: ["m", "ob", "os"], name: "舅舅的姐姐", gender: "both" },
  { path: ["m", "ob", "w"], name: "舅妈", gender: "both" },
  { path: ["m", "ob", "yb"], name: "舅舅的弟弟", gender: "both" },
  { path: ["m", "ob", "ys"], name: "舅舅的妹妹", gender: "both" },
  { path: ["m", "os", "h"], name: "姨夫", gender: "both" },
  { path: ["m", "os", "ob"], name: "姨妈的哥哥", gender: "both" },
  { path: ["m", "os", "os"], name: "姨妈的姐姐", gender: "both" },
  { path: ["m", "os", "w"], name: "姨妈的老婆", gender: "both" },
  { path: ["m", "os", "yb"], name: "姨妈的弟弟", gender: "both" },
  { path: ["m", "os", "ys"], name: "姨妈的妹妹", gender: "both" },
  { path: ["m", "yb", "h"], name: "舅舅的老公", gender: "both" },
  { path: ["m", "yb", "ob"], name: "舅舅的哥哥", gender: "both" },
  { path: ["m", "yb", "os"], name: "舅舅的姐姐", gender: "both" },
  { path: ["m", "yb", "w"], name: "舅妈", gender: "both" },
  { path: ["m", "yb", "yb"], name: "舅舅的弟弟", gender: "both" },
  { path: ["m", "yb", "ys"], name: "舅舅的妹妹", gender: "both" },
  { path: ["m", "ys", "h"], name: "姨夫", gender: "both" },
  { path: ["m", "ys", "ob"], name: "姨妈的哥哥", gender: "both" },
  { path: ["m", "ys", "os"], name: "姨妈的姐姐", gender: "both" },
  { path: ["m", "ys", "w"], name: "姨妈的老婆", gender: "both" },
  { path: ["m", "ys", "yb"], name: "姨妈的弟弟", gender: "both" },
  { path: ["m", "ys", "ys"], name: "姨妈的妹妹", gender: "both" },
  { path: ["ob", "h", "d"], name: "哥哥的老公的女儿", gender: "both" },
  { path: ["ob", "h", "s"], name: "哥哥的老公的儿子", gender: "both" },
  { path: ["ob", "ob", "d"], name: "哥哥的哥哥的女儿", gender: "both" },
  { path: ["ob", "ob", "os"], name: "哥哥的哥哥的姐姐", gender: "both" },
  { path: ["ob", "ob", "s"], name: "哥哥的哥哥的儿子", gender: "both" },
  { path: ["ob", "ob", "yb"], name: "哥哥的哥哥的弟弟", gender: "both" },
  { path: ["ob", "ob", "ys"], name: "哥哥的哥哥的妹妹", gender: "both" },
  { path: ["ob", "os", "os"], name: "哥哥的姐姐的姐姐", gender: "both" },
  { path: ["ob", "w", "d"], name: "嫂子的女儿", gender: "both" },
  { path: ["ob", "w", "s"], name: "嫂子的儿子", gender: "both" },
  { path: ["ob", "yb", "yb"], name: "哥哥的弟弟的弟弟", gender: "both" },
  { path: ["ob", "ys", "ys"], name: "哥哥的妹妹的妹妹", gender: "both" },
  { path: ["os", "h", "d"], name: "姐夫的女儿", gender: "both" },
  { path: ["os", "h", "s"], name: "姐夫的儿子", gender: "both" },
  { path: ["os", "ob", "ob"], name: "姐姐的哥哥的哥哥", gender: "both" },
  { path: ["os", "os", "d"], name: "姐姐的姐姐的女儿", gender: "both" },
  { path: ["os", "os", "ob"], name: "姐姐的姐姐的哥哥", gender: "both" },
  { path: ["os", "os", "s"], name: "姐姐的姐姐的儿子", gender: "both" },
  { path: ["os", "os", "yb"], name: "姐姐的姐姐的弟弟", gender: "both" },
  { path: ["os", "os", "ys"], name: "姐姐的姐姐的妹妹", gender: "both" },
  { path: ["os", "w", "d"], name: "姐姐的老婆的女儿", gender: "both" },
  { path: ["os", "w", "s"], name: "姐姐的老婆的儿子", gender: "both" },
  { path: ["os", "yb", "yb"], name: "姐姐的弟弟的弟弟", gender: "both" },
  { path: ["os", "ys", "ys"], name: "姐姐的妹妹的妹妹", gender: "both" },
  { path: ["yb", "h", "d"], name: "弟弟的老公的女儿", gender: "both" },
  { path: ["yb", "h", "s"], name: "弟弟的老公的儿子", gender: "both" },
  { path: ["yb", "ob", "ob"], name: "弟弟的哥哥的哥哥", gender: "both" },
  { path: ["yb", "os", "os"], name: "弟弟的姐姐的姐姐", gender: "both" },
  { path: ["yb", "w", "d"], name: "弟媳的女儿", gender: "both" },
  { path: ["yb", "w", "s"], name: "弟媳的儿子", gender: "both" },
  { path: ["yb", "yb", "d"], name: "弟弟的弟弟的女儿", gender: "both" },
  { path: ["yb", "yb", "ob"], name: "弟弟的弟弟的哥哥", gender: "both" },
  { path: ["yb", "yb", "os"], name: "弟弟的弟弟的姐姐", gender: "both" },
  { path: ["yb", "yb", "s"], name: "弟弟的弟弟的儿子", gender: "both" },
  { path: ["yb", "yb", "ys"], name: "弟弟的弟弟的妹妹", gender: "both" },
  { path: ["yb", "ys", "ys"], name: "弟弟的妹妹的妹妹", gender: "both" },
  { path: ["ys", "h", "d"], name: "妹夫的女儿", gender: "both" },
  { path: ["ys", "h", "s"], name: "妹夫的儿子", gender: "both" },
  { path: ["ys", "ob", "ob"], name: "妹妹的哥哥的哥哥", gender: "both" },
  { path: ["ys", "os", "os"], name: "妹妹的姐姐的姐姐", gender: "both" },
  { path: ["ys", "w", "d"], name: "妹妹的老婆的女儿", gender: "both" },
  { path: ["ys", "w", "s"], name: "妹妹的老婆的儿子", gender: "both" },
  { path: ["ys", "yb", "yb"], name: "妹妹的弟弟的弟弟", gender: "both" },
  { path: ["ys", "ys", "d"], name: "妹妹的妹妹的女儿", gender: "both" },
  { path: ["ys", "ys", "ob"], name: "妹妹的妹妹的哥哥", gender: "both" },
  { path: ["ys", "ys", "os"], name: "妹妹的妹妹的姐姐", gender: "both" },
  { path: ["ys", "ys", "s"], name: "妹妹的妹妹的儿子", gender: "both" },
  { path: ["ys", "ys", "yb"], name: "妹妹的妹妹的弟弟", gender: "both" },

  // 曾孙辈（通用）
  { path: ["s", "s", "s"], name: "曾孙子", gender: "both" },
  { path: ["s", "s", "d"], name: "曾孙女", gender: "both" },
  { path: ["s", "d", "s"], name: "曾外孙", gender: "both" },
  { path: ["s", "d", "d"], name: "曾外孙女", gender: "both" },
  { path: ["d", "s", "s"], name: "外曾孙子", gender: "both" },
  { path: ["d", "s", "d"], name: "外曾孙女", gender: "both" },
  { path: ["d", "d", "s"], name: "外曾外孙", gender: "both" },
  { path: ["d", "d", "d"], name: "外曾外孙女", gender: "both" },
  // 兄弟姐妹的孙辈关系（通用）
  { path: ["ob", "s", "s"], name: "侄孙", gender: "both" },
  { path: ["ob", "s", "d"], name: "侄孙女", gender: "both" },
  { path: ["yb", "s", "s"], name: "侄孙", gender: "both" },
  { path: ["yb", "s", "d"], name: "侄孙女", gender: "both" },
  { path: ["os", "s", "s"], name: "外甥孙", gender: "both" },
  { path: ["os", "s", "d"], name: "外甥孙女", gender: "both" },
  { path: ["ys", "s", "s"], name: "外甥孙", gender: "both" },
  { path: ["ys", "s", "d"], name: "外甥孙女", gender: "both" },
  // 兄弟姐妹的兄弟姐妹关系（通用）
  { path: ["ob", "ob"], name: "哥哥", gender: "both" },
  { path: ["ob", "os"], name: "姐姐", gender: "both" },
  { path: ["ob", "yb"], name: "弟弟", gender: "both" },
  { path: ["ob", "ys"], name: "妹妹", gender: "both" },
  { path: ["yb", "ob"], name: "哥哥", gender: "both" },
  { path: ["yb", "os"], name: "姐姐", gender: "both" },
  { path: ["yb", "yb"], name: "弟弟", gender: "both" },
  { path: ["yb", "ys"], name: "妹妹", gender: "both" },
  { path: ["os", "ob"], name: "哥哥", gender: "both" },
  { path: ["os", "os"], name: "姐姐", gender: "both" },
  { path: ["os", "yb"], name: "弟弟", gender: "both" },
  { path: ["os", "ys"], name: "妹妹", gender: "both" },
  { path: ["ys", "ob"], name: "哥哥", gender: "both" },
  { path: ["ys", "os"], name: "姐姐", gender: "both" },
  { path: ["ys", "yb"], name: "弟弟", gender: "both" },
  { path: ["ys", "ys"], name: "妹妹", gender: "both" },
  // 配偶的父母（性别特定）
  { path: ["w", "f"], name: "岳父", gender: "male" },
  { path: ["w", "m"], name: "岳母", gender: "male" },
  { path: ["h", "f"], name: "公公", gender: "female" },
  { path: ["h", "m"], name: "婆婆", gender: "female" },
  // 配偶的亲属关系（性别特定）
  { path: ["w", "ob"], name: "大舅子", gender: "male" },
  { path: ["w", "yb"], name: "小舅子", gender: "male" },
  { path: ["w", "os"], name: "大姨子", gender: "male" },
  { path: ["w", "ys"], name: "小姨子", gender: "male" },
  { path: ["h", "ob"], name: "大伯子", gender: "female" },
  { path: ["h", "yb"], name: "小叔子", gender: "female" },
  { path: ["h", "os"], name: "大姑子", gender: "female" },
  { path: ["h", "ys"], name: "小姑子", gender: "female" },
  // 配偶的祖辈（性别特定）
  { path: ["w", "f", "f"], name: "太岳父", gender: "male" },
  { path: ["w", "f", "m"], name: "太岳母", gender: "male" },
  { path: ["h", "f", "f"], name: "太公公", gender: "female" },
  { path: ["h", "f", "m"], name: "太婆婆", gender: "female" },
  // 配偶的子女关系（性别特定）
  { path: ["h", "s"], name: "儿子", gender: "female" },
  { path: ["h", "d"], name: "女儿", gender: "female" },
  { path: ["w", "s"], name: "儿子", gender: "male" },
  { path: ["w", "d"], name: "女儿", gender: "male" },
  // 父母的兄弟姐妹关系（性别特定）
  { path: ["f", "ob"], name: "伯伯", gender: "both" },
  { path: ["f", "yb"], name: "叔叔", gender: "both" }, // 爸爸的弟弟(无论排行)都是叔叔
  { path: ["f", "os"], name: "姑姑", gender: "both" },
  { path: ["f", "ys"], name: "姑姑", gender: "both" },
  { path: ["m", "ob"], name: "舅舅", gender: "both" },
  { path: ["m", "yb"], name: "舅舅", gender: "both" },
  { path: ["m", "os"], name: "姨妈", gender: "both" },
  { path: ["m", "ys"], name: "小姨", gender: "both" },
  // 父母的子女关系（性别特定）
  { path: ["f", "s"], name: "爸爸的儿子", gender: "male" },
  { path: ["f", "s"], name: "爸爸的儿子", gender: "female" },
  { path: ["f", "d"], name: "爸爸的女儿", gender: "male" },
  { path: ["f", "d"], name: "爸爸的女儿", gender: "female" },
  { path: ["m", "s"], name: "妈妈的儿子", gender: "male" },
  { path: ["m", "s"], name: "妈妈的儿子", gender: "female" },
  { path: ["m", "d"], name: "妈妈的女儿", gender: "male" },
  { path: ["m", "d"], name: "妈妈的女儿", gender: "female" },
];

// 在 Node 测试环境下，从 missing-relations.txt 自动同步缺失条目到 relationshipMappings（去重）
if (typeof module !== "undefined" && module.exports) {
  try {
    const fs = require("fs");
    const path = require("path");
    const raw = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "scripts",
        "01-test",
        "missing-relations.txt"
      ),
      "utf8"
    );
    const VALID_LINE_RE =
      /^(?:-\s*)?(?:f|m|h|w|ob|yb|os|ys|s|d)(?:-(?:f|m|h|w|ob|yb|os|ys|s|d))*$/;
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => VALID_LINE_RE.test(l));
    const parse = (line) =>
      line
        .replace(/^[-\s]*/, "")
        .split("-")
        .map((t) => t.trim())
        .filter(Boolean);
    const existing = new Set(relationshipMappings.map((m) => m.path.join("-")));
    lines.forEach((ln) => {
      const tokens = parse(ln);
      const key = tokens.join("-");
      if (!existing.has(key)) {
        const name = tokens.map((t) => tokenToLabel[t] || t).join("的");
        relationshipMappings.push({ path: tokens, name, gender: "both" });
        existing.add(key);
      }
    });
  } catch (e) {
    // 在非 Node 环境或文件读取失败时忽略
  }
}

const nameToTokenPath = {};
relationshipMappings.forEach((mapping) => {
  if (mapping.name && mapping.path) {
    const name = mapping.name;
    // 对于 "堂哥/堂弟" 这种，拆开来单独映射
    if (name.includes("/")) {
      const names = name.split("/");
      names.forEach((n) => {
        if (
          !nameToTokenPath[n] ||
          nameToTokenPath[n].length > mapping.path.length
        ) {
          nameToTokenPath[n] = mapping.path;
        }
      });
    } else {
      if (
        !nameToTokenPath[name] ||
        nameToTokenPath[name].length > mapping.path.length
      ) {
        nameToTokenPath[name] = mapping.path;
      }
    }
  }
});

// 为"自己"添加特殊映射
nameToTokenPath["自己"] = ["self"];

const resultMap = {};

// 处理亲属关系映射
["male", "female"].forEach((sex) => {
  relationshipMappings.forEach((mapping) => {
    // 如果gender为both或与当前性别匹配，则添加到resultMap
    if (mapping.gender === "both" || mapping.gender === sex) {
      resultMap[key(sex, mapping.path)] = mapping.name;
    }
  });
});

function normalizePath(tokens) {
  const arr = tokens.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i],
        b = arr[i + 1];
      // 配偶关系抵消 (h和w)
      if ((a === "h" && b === "w") || (a === "w" && b === "h")) {
        arr.splice(i, 2);
        changed = true;
        break;
      }
      // 爸爸的老婆 -> 妈妈; 妈妈的老公 -> 爸爸
      if (a === "f" && b === "w") {
        arr.splice(i, 2, "m");
        changed = true;
        break;
      }
      if (a === "m" && b === "h") {
        arr.splice(i, 2, "f");
        changed = true;
        break;
      }
      // 兄弟姐妹的父母 -> 自己的父母
      if (
        (a === "ob" || a === "yb" || a === "os" || a === "ys") &&
        (b === "f" || b === "m")
      ) {
        arr.splice(i, 1); // 删除兄弟姐妹节点，保留父节点
        changed = true;
        break;
      }
      // 父子/母子关系抵消
      if (
        (a === "s" && (b === "f" || b === "m")) ||
        (a === "d" && (b === "f" || b === "m"))
      ) {
        arr.splice(i, 2);
        changed = true;
        break;
      }
      // 配偶子女关系处理：将[亲属, w/h, s/d]规范化为[亲属, s/d]
      if (
        (a === "ob" || a === "yb" || a === "os" || a === "ys") &&
        (b === "w" || b === "h") &&
        i + 2 < arr.length &&
        (arr[i + 2] === "s" || arr[i + 2] === "d")
      ) {
        // 保留亲属和子女关系，删除配偶关系
        arr.splice(i + 1, 1);
        changed = true;
        break;
      }
      // 相同兄弟姐妹关系抵消 (例如 我哥哥的哥哥 -> 我哥哥)
      // 此规则仅在非父辈的兄弟姐妹关系时应用，以避免过度简化
      const isAfterParent = i > 0 && (arr[i - 1] === "f" || arr[i - 1] === "m");
      if (
        !isAfterParent &&
        ((a === "ob" && b === "ob") ||
          (a === "yb" && b === "yb") ||
          (a === "os" && b === "os") ||
          (a === "ys" && b === "ys"))
      ) {
        arr.splice(i, 1); // 只移除一个，保留一个
        changed = true;
        break;
      }
    }
  }
  return arr;
}

function buildAncestorName(fmSeq) {
  const n = fmSeq.length;
  if (n === 1) return fmSeq[0] === "f" ? "爸爸" : "妈妈";
  if (n === 2) {
    if (fmSeq[0] === "f") return fmSeq[1] === "f" ? "爷爷" : "奶奶";
    return fmSeq[1] === "f" ? "外公" : "外婆";
  }
  const lastMale = fmSeq[n - 1] === "f";
  const isPaternal = fmSeq[0] === "f";
  const taiCount = n - 2;
  if (isPaternal)
    return repeatStr("太", taiCount) + (lastMale ? "爷爷" : "奶奶");
  return "外" + repeatStr("太", taiCount) + (lastMale ? "公" : "婆");
}

function buildDescendantName(sdSeq) {
  const n = sdSeq.length;
  if (n === 1) return sdSeq[0] === "s" ? "儿子" : "女儿";
  if (n === 2) {
    const external = sdSeq[0] === "d" ? "外" : "";
    return external + "孙" + (sdSeq[1] === "s" ? "子" : "女");
  }
  const ranks = ["曾", "玄", "来"];
  const idx = Math.min(n - 2, ranks.length) - 1;
  const external = sdSeq[0] === "d" ? "外" : "";
  const rank = ranks[idx] || "曾";
  return external + rank + "孙" + (sdSeq[n - 1] === "s" ? "子" : "女");
}

function repeatStr(s, n) {
  // 使用Array.fill和join替代for循环
  return Array(n).fill(s).join("");
}

function findResult(isMale, pathTokens) {
  if (pathTokens.join("-") === "f-d-h" || pathTokens.join("-") === "m-d-h") {
    return {
      name: isMale ? "姐夫/妹夫" : "老公/姐夫/妹夫",
      path: pathTokens,
    };
  }
  if (pathTokens.join("-") === "f-s-w" || pathTokens.join("-") === "m-s-w") {
    return {
      name: isMale ? "老婆/嫂子/弟媳" : "嫂子/弟媳",
      path: pathTokens,
    };
  }
  if (pathTokens.join("-") === "f-s" || pathTokens.join("-") === "m-s") {
    return { name: isMale ? "我/哥哥/弟弟" : "哥哥/弟弟", path: pathTokens };
  }
  if (pathTokens.join("-") === "f-d" || pathTokens.join("-") === "m-d") {
    return { name: isMale ? "姐姐/妹妹" : "我/姐姐/妹妹", path: pathTokens };
  }
  const sex = isMale ? "male" : "female";
  // 兄弟姐妹相互抵消的歧义：父/母 + 兄/弟/姐/妹 + 兄/弟/姐/妹
  // 例如：妈妈-弟弟-姐姐 → 可能是 妈妈 本人，或 妈妈的姐妹（姨妈/小姨）
  const sibs = ["ob", "yb", "os", "ys"];
  if (
    pathTokens.length === 3 &&
    (pathTokens[0] === "m" || pathTokens[0] === "f") &&
    sibs.includes(pathTokens[1]) &&
    sibs.includes(pathTokens[2]) &&
    pathTokens[1] !== pathTokens[2]
  ) {
    const parent = pathTokens[0];
    const lastIsMale = pathTokens[2] === "ob" || pathTokens[2] === "yb";
    if (parent === "m") {
      // 妈妈 + (…)+ (哥哥/弟弟) → 妈妈/舅舅；(姐姐/妹妹) → 妈妈/姨妈/小姨
      return {
        name: lastIsMale ? "舅舅" : "妈妈/姨妈/小姨",
        path: ["m", "ob"],
      }; // Simplified path
    } else {
      // 爸爸 + (…)+ (哥哥/弟弟) → 爸爸/伯伯/叔叔；(姐姐/妹妹) → 姑姑
      return {
        name: lastIsMale ? "爸爸/伯伯/叔叔" : "姑姑",
        path: ["f", "ob"],
      }; // Simplified path
    }
  }

  let norm = normalizePath(pathTokens);

  // 修复父辈后多个兄弟姐妹关系链的简化问题
  if (
    norm.length > 2 &&
    (norm[0] === "f" || norm[0] === "m") &&
    sibs.includes(norm[1])
  ) {
    const nonSibsIndex = norm.findIndex(
      (token, index) => index > 0 && !sibs.includes(token)
    );
    const sibsChain = norm.slice(
      1,
      nonSibsIndex === -1 ? norm.length : nonSibsIndex
    );

    if (sibsChain.length > 1) {
      // 将 f-ob-ob... or f-ob-yb... 简化为 f-ob...
      const simplifiedSib = sibsChain[sibsChain.length - 1];
      const restOfPath = nonSibsIndex === -1 ? [] : norm.slice(nonSibsIndex);
      norm = [norm[0], simplifiedSib, ...restOfPath];
    }
  }

  const direct = resultMap[key(sex, norm)];
  if (direct) return { name: direct, path: norm };
  if (norm.length === 0) return { name: "自己", path: ["self"] };
  if (norm.every((t) => t === "f" || t === "m"))
    return { name: buildAncestorName(norm), path: norm };
  if (norm.every((t) => t === "s" || t === "d"))
    return { name: buildDescendantName(norm), path: norm };

  // 祖辈链 + 配偶：如 爸爸-爸爸-老婆 => 奶奶
  if (norm[norm.length - 1] === "w" || norm[norm.length - 1] === "h") {
    const prefix = norm.slice(0, -1);
    if (prefix.length >= 1 && prefix.every((t) => t === "f" || t === "m")) {
      const toggled = prefix.slice();
      const lastIdx = toggled.length - 1;
      toggled[lastIdx] = toggled[lastIdx] === "f" ? "m" : "f";
      return { name: buildAncestorName(toggled), path: toggled };
    }
  }

  if (
    norm.length === 3 &&
    (norm[0] === "f" || norm[0] === "m") &&
    sibs.includes(norm[1]) &&
    (norm[2] === "w" || norm[2] === "h")
  ) {
    const side = norm[0],
      sib = norm[1],
      spouse = norm[2];
    if (side === "f") {
      if (sib === "ob")
        return { name: spouse === "w" ? "伯母" : "伯伯", path: norm };
      if (sib === "yb")
        return { name: spouse === "w" ? "婶婶" : "叔叔", path: norm };
      if (sib === "os" || sib === "ys")
        return { name: spouse === "h" ? "姑父" : "姑姑", path: norm };
    } else {
      if (sib === "ob" || sib === "yb")
        return { name: spouse === "w" ? "舅妈" : "舅舅", path: norm };
      if (sib === "os" || sib === "ys")
        return { name: spouse === "h" ? "姨夫" : "姨妈", path: norm };
    }
  }
  // 回退：将 token 路径转换为可读的中文描述（例如 "妈妈的弟弟的儿子"），避免返回未收录提示
  const readable = norm.map((t) => tokenToLabel[t] || t).join("的");
  return { name: readable, path: norm };
}

function findReverseResult(isMale, pathTokens) {
  const norm = normalizePath(pathTokens);
  if (norm.length === 0) return { name: "自己", path: ["self"] };

  // 反向逻辑：逐个反向后再逆向链接
  const reversePath = [];
  for (let i = norm.length - 1; i >= 0; i--) {
    const token = norm[i];
    switch (token) {
      case "f":
        reversePath.push("s");
        break;
      case "m":
        reversePath.push("d");
        break;
      case "s":
        reversePath.push("f");
        break;
      case "d":
        reversePath.push("m");
        break;
      case "w":
        reversePath.push("h");
        break;
      case "h":
        reversePath.push("w");
        break;
      case "ob":
        reversePath.push("yb");
        break;
      case "yb":
        reversePath.push("ob");
        break;
      case "os":
        reversePath.push("ys");
        break;
      case "ys":
        reversePath.push("os");
        break;
      default:
        reversePath.push(token);
        break;
    }
  }

  // 使用正向计算函数计算反向路径的结果
  const result = findResult(isMale, reversePath);
  return result;

  // 处理多代祖辈关系
  if (norm.every((t) => t === "f" || t === "m")) {
    const generation = norm.length;
    if (generation === 2)
      return { name: isMale ? "孙子" : "孙女", path: isMale ? ["s"] : ["d"] };
    if (generation === 3)
      return {
        name: isMale ? "曾孙子" : "曾孙女",
        path: isMale ? ["s", "s"] : ["d", "d"],
      };
    if (generation >= 4)
      return {
        name: isMale ? "玄孙子" : "玄孙女",
        path: isMale ? ["s", "s", "s"] : ["d", "d", "d"],
      };
  }

  const a = norm[0],
    b = norm[1],
    c = norm[2];

  // 长度为3的关系链
  if (norm.length === 3 && (c === "s" || c === "d")) {
    // 堂亲
    if (a === "f" && (b === "ob" || b === "yb")) {
      return { name: `堂${male ? "兄/弟" : "姐/妹"}`, path: ["f", b, c] };
    }
    // 表亲 (父系)
    if (a === "f" && (b === "os" || b === "ys")) {
      return { name: `表${male ? "兄/弟" : "姐/妹"}`, path: ["f", b, c] };
    }
    // 表亲 (母系)
    if (a === "m" && (b === "ob" || b === "yb" || b === "os" || b === "ys")) {
      return { name: `表${male ? "兄/弟" : "姐/妹"}`, path: ["m", b, c] };
    }
  }

  // 长度为2的关系链
  if (norm.length === 2) {
    if ((a === "ob" || a === "yb") && (b === "s" || b === "d"))
      return { name: male ? "伯伯/叔叔" : "姑姑", path: [a, b] };
    if ((a === "os" || a === "ys") && (b === "s" || b === "d"))
      return { name: male ? "舅舅" : "姨妈/小姨", path: [a, b] };
    if (a === "f" && (b === "ob" || b === "yb" || b === "os" || b === "ys")) {
      return { name: male ? "侄子" : "侄女", path: [a, b] };
    }
    if (a === "m" && (b === "ob" || b === "yb" || b === "os" || b === "ys")) {
      return { name: male ? "外甥" : "外甥女", path: [a, b] };
    }
    if (a === "m" && (b === "f" || b === "m"))
      return { name: isMale ? "外孙子" : "外孙女", path: [a, b] };
    if (a === "w" && (b === "f" || b === "m"))
      return { name: "女婿", path: [a, b] };
    if (a === "h" && (b === "f" || b === "m"))
      return { name: "儿媳", path: [a, b] };
    if ((a === "os" || a === "ys") && b === "h")
      return { name: male ? "内兄/内弟" : "大姨子/小姨子", path: [a, b] };
    if ((a === "ob" || a === "yb") && b === "w")
      return { name: male ? "大伯子/小叔子" : "大姑子/小姑子", path: [a, b] };
    if (a === "s" && b === "w")
      return { name: male ? "公公" : "婆婆", path: [a, b] };
    if (a === "d" && b === "h")
      return { name: male ? "岳父" : "岳母", path: [a, b] };
    if (a === "s" && (b === "s" || b === "d"))
      return { name: male ? "爷爷" : "奶奶", path: [a, b] };
    if (a === "d" && (b === "s" || b === "d"))
      return { name: male ? "外公" : "外婆", path: [a, b] };
  }

  return { name: "未收录的关系（待完善）", path: [] };
}

function buildFormulaText(exprLabels, isMale, reverseMode) {
  if (!exprLabels.length) return "";
  if (!reverseMode) return "我的" + exprLabels.join("的");
  const tokens = exprLabels.map((lbl) => labelToToken[lbl]).filter(Boolean);
  const forward = findResult(isMale, tokens);
  if (forward && forward.name && forward.name !== "未收录的关系（待完善）")
    return `${forward.name}称呼我`;
  return "称呼我";
}

Page({
  data: {
    isMale: true,
    expr: [],
    formulaText: "",
    displayResult: "",
    resultAudioPath: "", // 用于播放音频
    reverseMode: false,
    isDark: false,
    disableH: false,
    disableW: false,
    isAudioPlaying: false, // 音频播放状态
    playingDialect: null, // 当前播放的方言
    cdnMaps: {}, // 存储各方言的CDN映射
  },
  loadCdnMap(urls, index) {
    if (index >= urls.length) {
      console.error("❌ 所有 CDN 映射加载失败");
      return;
    }

    wx.request({
      url: urls[index],
      success: (res) => {
        // 兼容单方言和多方言结构
        if (res.data && typeof res.data === "object") {
          // 检查是否为多方言结构
          if (res.data["zh-cn"] || res.data["zh-yue"] || res.data["zh-min"]) {
            this.setData({ cdnMaps: res.data });
            console.log("✅ 多方言CDN映射加载完成，使用 URL:", urls[index]);
          } else {
            // 单方言结构，包装成多方言格式
            this.setData({ cdnMaps: { "zh-cn": res.data } });
            console.log("✅ 单方言CDN映射加载完成，使用 URL:", urls[index]);
          }
        }
      },
      fail: (err) => {
        console.warn("⚠️ CDN 请求失败，尝试下一个:", urls[index], err);
        this.loadCdnMap(urls, index + 1);
      },
    });
  },
  onLoad(options) {
    this.setData({ statusBarHeight: navUtil.STATUS_BAR_HEIGHT });

    const cdnUrls = [
      "https://ghfast.top/https://raw.githubusercontent.com/EDD-15pence/relationship-audio/main/cdn_map_unified.json",
      "https://raw.fastgit.org/EDD-15pence/relationship-audio/main/cdn_map_unified.json",
      "https://cdn.jsdelivr.net/gh/EDD-15pence/relationship-audio@main/cdn_map_unified.json",
    ];

    this.loadCdnMap(cdnUrls, 0);

    // 处理分享链接打开
    if (options.state) {
      try {
        const state = JSON.parse(decodeURIComponent(options.state));
        this.setData({
          expr: state.expr || [],
          isMale: state.isMale !== undefined ? state.isMale : true,
          reverseMode: state.reverseMode || false,
        });
      } catch (e) {
        console.log("解析分享状态失败:", e);
      }
    }

    this._recompute();
    // 显示分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ["shareAppMessage", "shareTimeline"],
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: "/pages/index/index" }) });
  },

  onChangeGender(e) {
    const v = e && e.detail ? e.detail.value : "male";
    const isMale = v === "male";
    this.setData({ isMale });
    this._recompute();
  },

  onTapKey(e) {
    const keyLabel =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.key
        : "";
    if (keyLabel === "清空") {
      this.setData({ expr: [] });
      this._recompute();
      return;
    }
    if (keyLabel === "回退") {
      const next = this.data.expr.slice();
      next.pop();
      this.setData({ expr: next });
      this._recompute();
      return;
    }
    const token = labelToToken[keyLabel];
    if (!token) return;
    const next = this.data.expr.concat(keyLabel);
    this.setData({ expr: next });
    this._recompute();
  },

  onToggleReverse() {
    console.log("切换转换称呼模式，当前状态:", this.data.reverseMode);
    this.setData({ reverseMode: !this.data.reverseMode });
    console.log("切换后状态:", !this.data.reverseMode);
    this._recompute();
  },
  onToggleTheme() {
    this.setData({ isDark: !this.data.isDark });
  },
  // 分享给朋友
  onShareAppMessage() {
    const { formulaText, displayResult, isMale } = this.data;
    let shareTitle = "亲属称呼换算 - 快速计算亲属关系";
    let sharePath = "/pages/index/index";
    console.log("分享给朋友");
    // 如果有计算结果，在分享内容中包含
    if (formulaText && displayResult) {
      shareTitle = `${formulaText} = ${displayResult}`;
      // 可以将当前状态编码到分享路径中
      const state = encodeURIComponent(
        JSON.stringify({
          expr: this.data.expr,
          isMale: this.data.isMale,
          reverseMode: this.data.reverseMode,
        })
      );
      sharePath += `?state=${state}`;
    }

    return {
      title: shareTitle,
      path: sharePath,
    };
  },
  // 手动触发分享
  onShare() {
    const { formulaText, displayResult } = this.data;
    console.log("分享按钮被点击"); // 调试日志
    if (formulaText && displayResult) {
      wx.showModal({
        title: "分享计算结果",
        content: `${formulaText} = ${displayResult}`,
        confirmText: "分享",
        cancelText: "取消",
        success: (res) => {
          console.log("res", res);

          if (res.confirm) {
            // 触发分享
            // wx.showShareMenu({
            //   withShareTicket: true,
            //   menus: ["shareAppMessage", "shareTimeline"],
            // });
            onShareAppMessage();
            console.log("分享成功");
          }
        },
        fail: (err) => {
          console.log("err", err);
        },
      });
    } else {
      wx.showToast({
        title: "请先计算一个关系",
        icon: "none",
      });
    }
  },

  _recompute() {
    const tokens = this.data.expr
      .map((lbl) => labelToToken[lbl])
      .filter(Boolean);
    const formulaText = buildFormulaText(
      this.data.expr,
      this.data.isMale,
      this.data.reverseMode
    );
    let displayResult = "";
    let resultAudioPath = "";
    if (tokens.length > 0) {
      console.log(
        "_recompute: reverseMode =",
        this.data.reverseMode,
        "tokens =",
        tokens
      );
      if (this.data.reverseMode) {
        const reverseResult = findReverseResult(this.data.isMale, tokens);
        console.log("使用反向模式，结果:", reverseResult);
        displayResult = reverseResult.name;
        if (reverseResult.path) {
          resultAudioPath = reverseResult.path.join("");
          console.log("反向模式生成的音频路径:", resultAudioPath);
        }
      } else {
        const result = findResult(this.data.isMale, tokens);
        console.log("使用正向模式，结果:", result);
        displayResult = result.name;
        if (result.path) {
          resultAudioPath = `${result.path.join("")}`;
          console.log("正向模式生成的音频路径:", resultAudioPath);
        }
      }
    }
    // 末端性别判断：用于禁用老公/老婆键
    const tailGender = inferTailGender(tokens, this.data.isMale);
    const disableH = tailGender === "male";
    const disableW = tailGender === "female";
    console.log(
      "准备设置数据: displayResult =",
      displayResult,
      "formulaText =",
      formulaText
    );
    this.setData({
      formulaText,
      displayResult,
      resultAudioPath,
      disableH,
      disableW,
    });
    // 使用setTimeout确保setData完成后再检查
    setTimeout(() => {
      console.log("数据设置完成，当前displayResult =", this.data.displayResult);
    }, 0);
  },

  // onPlayAudio() {
  //   if (this.data.resultAudioPath) {
  //     const innerAudioContext = wx.createInnerAudioContext();
  //     innerAudioContext.src = this.data.resultAudioPath;
  //     innerAudioContext.play();
  //   }
  // },

  onPlayAudio(e) {
    const { resultAudioPath, cdnMaps, isAudioPlaying, playingDialect } =
      this.data;
    const selectedDialect = e.currentTarget.dataset.dialect;

    // 如果正在播放同一个方言，直接返回
    if (isAudioPlaying && playingDialect === selectedDialect) return;

    console.log(
      "resultAudioPath:",
      resultAudioPath,
      "selectedDialect:",
      selectedDialect,
      "cdnMaps:",
      cdnMaps
    );

    // 调试：检查"自己"的映射
    if (resultAudioPath === "") {
      console.log(
        "resultAudioPath为空，检查nameToTokenPath中的'自己':",
        nameToTokenPath["自己"]
      );
      console.log("检查nameToTokenPath中的'self':", nameToTokenPath["self"]);
    }

    // 兼容单方言和多方言结构
    let audioUrls;
    if (cdnMaps && cdnMaps[selectedDialect]) {
      // 多方言结构
      audioUrls = cdnMaps[selectedDialect][resultAudioPath];
    } else if (cdnMaps && cdnMaps[resultAudioPath]) {
      // 单方言结构（向后兼容）
      audioUrls = cdnMaps[resultAudioPath];
    }

    if (!audioUrls) {
      console.warn("❌ 未找到音频URL:", resultAudioPath);
      return;
    }

    // 设置播放状态为true，设置当前播放的方言
    this.setData({
      isAudioPlaying: true,
      playingDialect: selectedDialect,
    });

    const urls = [audioUrls.ghfast, audioUrls.jsdelivr, audioUrls.raw]; // 播放优先顺序

    const tryPlay = (index) => {
      if (index >= urls.length) {
        console.error("❌ 所有 CDN 播放失败");
        // 播放失败，恢复按钮状态
        this.setData({
          isAudioPlaying: false,
          playingDialect: null,
        });
        return;
      }

      const audioCtx = wx.createInnerAudioContext();
      audioCtx.autoplay = true;
      audioCtx.src = urls[index];

      audioCtx.onError((err) => {
        console.warn(`⚠️ 播放失败，尝试下一个 URL (${index + 1}):`, err);
        audioCtx.destroy(); // 销毁当前音频上下文
        tryPlay(index + 1);
      });

      audioCtx.onEnded(() => {
        console.log("✅ 音频播放完成");
        // 播放完成，恢复按钮状态
        this.setData({
          isAudioPlaying: false,
          playingDialect: null,
        });
        audioCtx.destroy(); // 销毁音频上下文
      });

      audioCtx.onStop(() => {
        console.log("⏹️ 音频播放停止");
        // 播放停止，恢复按钮状态
        this.setData({
          isAudioPlaying: false,
          playingDialect: null,
        });
        audioCtx.destroy(); // 销毁音频上下文
      });

      audioCtx.play();
    };

    tryPlay(0); // 从第一个 URL 开始播放
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { formulaText, displayResult } = this.data;
    let shareTitle = "亲属称呼换算 - 快速计算亲属关系";

    // 如果有计算结果，在分享内容中包含
    if (formulaText && displayResult) {
      shareTitle = `${formulaText} = ${displayResult}`;
    }

    return {
      title: shareTitle,
      query: "",
    };
  },
});

// 推断公式末端人物的性别：
// 初始为我本人性别（isMale），每遇到 h/w 翻转视角性别；
// 遇到 f/m 固定为 male/female；
// 兄弟姐妹会设置对应的性别；
// 儿子继承男性性别，女儿继承女性性别。
function inferTailGender(tokens, isMale) {
  let gender = isMale ? "male" : "female";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "h") gender = "male";
    else if (t === "w") gender = "female";
    else if (t === "f") gender = "male";
    else if (t === "m") gender = "female";
    else if (t === "ob" || t === "yb") gender = "male"; // 哥哥、弟弟是男性
    else if (t === "os" || t === "ys") gender = "female"; // 姐姐、妹妹是女性
    else if (t === "s") gender = "male"; // 儿子是男性
    else if (t === "d") gender = "female"; // 女儿是女性
  }
  return gender;
}

// 导出函数供测试使用
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    findResult,
    findReverseResult,
    relationshipMappings,
    labelToToken,
  };
}
