# GitHub发布说明

用户确认目标：公开仓库 **C-xudco/PondClock**。许可：**非商业二创，商业使用另行授权**。本轮是发布与文档补全，不调整V2.0.1游戏规则；不把软件第二版预设为旧完整版。

## 发布内容

源码、开发文档、源素材制作/审计记录、阶段计划与检查结果、自动测试和必要工具；Windows免安装包通过Release分发，不把约165MB的ZIP放进普通Git提交。根README是使用入口；开发导航在docs/development。

公开镜像保留源提交的先后、日期、说明和父子关系，但过滤四张无再分发许可的用户参考原图，规范化个人目录和微信标识，并使用公开noreply邮箱。不会把本机整个工作目录、node_modules、真实存档、测试档案或Git凭据上传。

源仓库与原始历史保留。`scripts/prepare-publication.cjs`在新的隔离目录创建镜像，不对源历史做force rewrite。`HISTORY_MAP.json`记录来源SHA与公开SHA的映射；原SHA只作追溯，不能当公开原对象仍可访问。96fd232和874cdac短标签指向过滤后的相应提交，用于现有历史回归测试；它们不等于原始提交哈希。

参考原图路径：docs/inkwash/references/landscape-reference.jpg、fisherman-reference.jpg；docs/default-character/references/scene-reference.png、character-reference.png。这些是本地美术方向参考，没有查到公开再分发许可。文档会说明缺失原因，避免读者误以为是运行资源丢失。

## 负责人与实际交接

Leader负责最终README、版权文件、逐文件索引、镜像/产物、账号验证、上传与回读。原派发的架构、内容、来源审查代理因额度限制中断，未完成文档输出；Leader已接管，不把其初步阅读当作完成的独立签核。既有2.0.0/2.0.1独立监督与视觉证据仍按原记录保留。

角色说明见roles/architecture、roles/content、roles/review的README；当前实际开发位置见 [文件导航](../development/FILE_MAP.md)、[数值/图鉴指南](../development/CONTENT_AND_BALANCE.md)、[调试](../development/DEBUGGING.md)、[全过程](../development/HISTORY.md)。

## 发布流程与回读

1. 固定源码、记录LICENSE/第三方来源、生成开发索引。
2. 在独立Git镜像中逐提交过滤并扫描；使用原包76个运行文件为基准，Release ZIP仅增加版权/许可说明，不改变游戏EXE和资源。
3. 镜像相关测试/lint/构建通过后，检查目标账号与新仓库空状态，再推送main及必要历史别名；不推本地未过滤分支。
4. 创建v2.0.1 Release，上传ZIP和SHA256SUMS；回读仓库可见性、main提交、Release文件尺寸和服务端SHA256。
5. 实际远端地址、哈希与状态记录在PUBLISH_CHECK.json；未到这一步不能把“已准备”写成“已发布”。

GitHub连接工具缺少创建仓库、上传Release二进制和完整Git历史的能力，因此这些步骤使用本机标准Git凭据助手和GitHub官方API；凭据只留内存，不进入命令输出、文件或仓库。公开仓库许可不自动覆盖第三方；版权文件不是官方登记证书。

## 本地复现

先运行generate-file-map，提交已审阅源文件，再向**不存在**的X:/game子目录运行prepare-publication。镜像README下载链接指向GitHub Release，历史机器绝对路径只作归档，不是读者必须创建的目录。阶段报告中指向未公开test-results的路径表示历史本机证据；公开保留的核验摘要和截图在docs内，不虚构缺失的原始日志。
