# 地区代表城市与坐标来源

核验日期：2026-10-20。数据来源为 [GeoNames](https://www.geonames.org/)，按其 [CC BY 4.0 许可](https://creativecommons.org/licenses/by/4.0/)注明出处。

本游戏把每个鱼群区域固定到一个代表城市。下表是城市点位的纬度、经度，单位为十进制度；不是机场、行政区质心或某个具体钓点。西北、青藏等区域覆盖很广，这种代表点属于游戏的地域近似口径。全部 132 条航线属于游戏交通网络，不表示现实中这些城市之间都存在商业直飞航班。

| 地区 ID | 代表城市 | 纬度 N | 经度 E | 直接来源 |
|---|---|---:|---:|---|
| jiangnan | 南京 | 32.06167 | 118.77778 | [GeoNames 1799962](https://www.geonames.org/1799962/nanjing.html) |
| huaihe | 蚌埠 | 32.94083 | 117.36083 | [GeoNames 1816440](https://www.geonames.org/1816440/bengbu.html) |
| huanghe | 郑州 | 34.75778 | 113.64861 | [GeoNames 1784658](https://www.geonames.org/1784658/zhengzhou.html) |
| changjiang | 武汉 | 30.58333 | 114.26667 | [GeoNames 1791247](https://www.geonames.org/1791247) |
| dongnan | 福州 | 26.06139 | 119.30611 | [GeoNames 1810821](https://www.geonames.org/1810821/fuzhou.html) |
| lingnan | 广州 | 23.11667 | 113.25000 | [GeoNames 1809858](https://www.geonames.org/1809858/guangzhou.html) |
| xinan | 重庆 | 29.56026 | 106.55771 | [GeoNames 1814906](https://www.geonames.org/1814906/chongqing.html) |
| yungui | 昆明 | 25.03889 | 102.71833 | [GeoNames 1804651](https://www.geonames.org/1804651/kunming.html) |
| hainan | 海口 | 20.03421 | 110.34651 | [GeoNames 1809078](https://www.geonames.org/1809078/haikou.html) |
| dongbei | 哈尔滨 | 45.75000 | 126.65000 | [GeoNames 2037013](https://www.geonames.org/2037013/harbin.html) |
| xibei | 乌鲁木齐 | 43.800965 | 87.600459 | [GeoNames 地名数据第 54 项](https://www.geonames.org/search.html?q=China%2F&startRow=50) |
| qingzang | 拉萨 | 29.65000 | 91.10000 | [GeoNames 1280737](https://www.geonames.org/1280737/lhasa.html) |

坐标静态保存在 `src/data/regionLocations.js`，运行游戏不访问 GeoNames。乌鲁木齐采用其城市点位，不使用搜索结果中的乌鲁木齐行政区点位或地窝堡机场点位；其余城市也同样采用城市点位。

## 航线规则

- `src/lib/gameConfig.js` 的地区 ID 与鱼群权重继续作为唯一基础数据源。
- Haversine 球面距离使用地球半径 6371 km；距离是代表城市点位间的地理近似，不是实际航班里程。
- 先生成 66 对无向距离，再展开为 132 个起点/终点航段；反向距离、基础票价和时间对称。
- 全网 `r = (distance - minDistance) / (maxDistance - minDistance)`，飞行毫秒数为 `round(60000 + 120000 × r)`，票价为 `round((200 + 5800 × r) / 10) × 10` 金币。
- 不生成同区航线。新增地区或修改坐标、归一化、票价参数时应递增 `TRAVEL_CONFIG.ruleVersion`；已出发旅途使用存档中的票价和抵达时间。

## 市场规则

市场的 42 × 12 个报价系数从地区鱼群权重自动生成。`q` 为该鱼在销售地的捕获权重占比，`qMax` 为该鱼在全部地区中的最大占比。`M = 0.8 + 1.2 × (1 - q / qMax)`，无产出地区 `q = 0`，自然得到 `M = 2`。每条鱼以数字 `caughtAtMs` 保存捕获时间；达到 604800000 ms（现实 168 小时）后，所有品质、鱼种和地区均卖 1 金币。

新鲜价格沿用旧品质和重量曲线，将未取整基础金额乘以市场系数后只取整一次。报价对象中的 `basePrice` 用旧算法的整数结果便于解释，不作为二次计价输入。缺失或无效捕获时间按过期处理，不能通过缺字段自动获得新保鲜期。调用方负责存档校验；这是单机规则，不建立防作弊系统。
