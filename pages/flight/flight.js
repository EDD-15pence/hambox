const PLATFORM_LIST = [
  { name: '携程旅行', shortName: '携程', color: '#2878ff', icon: '携' },
  { name: '去哪儿旅行', shortName: '去哪儿', color: '#13a8ff', icon: '去' },
  { name: '同程旅行', shortName: '同程', color: '#20b968', icon: '同' },
  { name: '飞猪旅行', shortName: '飞猪', color: '#ff6a00', icon: '飞' },
];

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

Page({
  data: { departure: '', destination: '', date: getToday(), minDate: getToday(), searched: false, routeText: '', platforms: [] },
  onDepartureInput(e) { this.setData({ departure: e.detail.value }); },
  onDestinationInput(e) { this.setData({ destination: e.detail.value }); },
  onDateChange(e) { this.setData({ date: e.detail.value }); },
  onSearch() {
    const departure = this.data.departure.trim();
    const destination = this.data.destination.trim();
    if (!departure || !destination) return wx.showToast({ title: '请填写出发地和目的地', icon: 'none' });
    if (departure === destination) return wx.showToast({ title: '出发地和目的地不能相同', icon: 'none' });
    this.setData({ searched: true, routeText: `${departure} → ${destination}`, platforms: PLATFORM_LIST.map((platform) => ({ ...platform, status: '待查询' })) });
  },
  onCopySearch(e) {
    const platform = e.currentTarget.dataset.platform;
    const query = `${this.data.departure.trim()}到${this.data.destination.trim()} ${this.data.date} 机票`;
    wx.setClipboardData({ data: query, success: () => wx.showToast({ title: `已复制${platform}行程`, icon: 'none' }) });
  },
});
