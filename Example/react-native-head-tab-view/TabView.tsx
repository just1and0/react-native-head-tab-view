
import React from 'react';
import {
    View,
    Animated,
    Platform,
    LayoutChangeEvent
} from 'react-native';
import { TABVIEW_TABDIDCLICK, TABVIEW_BECOME_RESPONDER, TABVIEW_HEADER_GRANT, TABVIEW_HEADER_RELEASE, TABVIEW_PULL_RELESE, TABVIEW_ONSCROLL } from './Const'
import Tabbar from './Tabbar'
import ScrollHeader from './ScrollHeader'
import PullRefreshView from './PullRefreshView'
import RefreshControlAnimated from './RefreshControlAnimated'
import { getContentAnimatedStyles, getScrollHeaderAnimatedStyles, pullRefreshAnimatedStyles } from './utils/animations'

const overflowPull = 50
import ViewPagerAndroid from "@react-native-community/viewpager";
import {
    PanGestureHandler,
    NativeViewGestureHandler,
    State,
    PanGestureHandlerStateChangeEvent
} from 'react-native-gesture-handler';
import { TabViewProps, TabViewState, TabbarInfo, PageViewHocProps, SceneProps, DisplayKeys } from './types'

const AnimatedViewPagerAndroid = Platform.OS === 'android' ?
    Animated.createAnimatedComponent(ViewPagerAndroid) :
    undefined;

const defaultProps = {
    tabs: [],
    initialPage: 0,
    preInitSceneNum: 0,
    faultHeight: 2,
    frozeTop: 0,
    scrollEnabled: true,
    refreshHeight: 100
}
interface ObserversItem {
    instance: any,
    callback: (...args: any[]) => void
}
interface Observers {
    [propName: string]: Array<ObserversItem>;
}

export default class TabView<T> extends React.PureComponent<TabViewProps<T> & typeof defaultProps, TabViewState<T>> {
    static defaultProps = defaultProps

    private positionAndroid: Animated.Value
    private scrollX: Animated.Value
    private dragY: Animated.Value = new Animated.Value(0)
    private offsetAndroid: Animated.Value = new Animated.Value(0)
    private headerTrans: Animated.Value = new Animated.Value(0)
    private tabviewRefreshTrans: Animated.Value = new Animated.Value(0)
    private scrollOnMountCalled: boolean = false
    private observers: Observers = {}
    private drawer: React.RefObject<any> = React.createRef();
    private contentScroll: React.RefObject<any> = React.createRef();
    private headerRef: React.RefObject<any> = React.createRef();
    private headerParentRef: React.RefObject<any> = React.createRef();
    private _onGestureEvent: (...args: any[]) => void
    private scrollView: any
    private androidPager: any
    private shouldStartRefresh: boolean = true
    private dragYEvent = ''
    private tabviewRefreshEvent = ''
    private containerTransEvent = ''
    private startDragY = 0
    private startRefresh = false

    constructor(props: TabViewProps<T> & typeof defaultProps) {
        super(props)

        this.positionAndroid = new Animated.Value(props.initialPage)
        this.scrollX = new Animated.Value(props.initialPage)


        const { refreshTrans, childRefs, sceneTrans } = this.initializes()
        const containerTrans = new Animated.Value(0)

        this.state = {
            sceneWidth: 0,
            tabviewHeight: 0,
            tabbarHeight: 0,
            currentIndex: props.initialPage,
            //所有页面是否需要显示和更新
            displayKeys: this.getDisplayScene(props.tabs, props.initialPage),
            //横向滑动的动画对象
            scrollValue: new Animated.Value(this.props.initialPage),
            tabs: props.tabs, //所有tab
            //控制垂直方向的整体滑动
            containerTrans,
            //子页面ref数组
            childRefs,
            //下拉刷新动画数组
            refreshTrans,
            //子页面实际滑动距离的动画数组
            sceneTrans,
            sceneScrollEnabled: props.scrollEnabled
        }

        this.handleScrollValue()
        this.makeScrollTrans()

        this._onGestureEvent = Animated.event(
            [{ nativeEvent: { translationY: this.dragY } }],
            { useNativeDriver: true }
        );
    }

    componentDidMount() {
        if (this.props.renderScrollHeader && !this.props.makeHeaderHeight) {
            console.warn('必须实现 makeHeaderHeight方法')
        }

        this.addViewListener()
    }

    componentWillUnmount() {
        this.removeViewListener()
    }

    componentDidUpdate(prevProps: TabViewProps<T> & typeof defaultProps, prevState: TabViewState<T>) {
        if (prevState.tabs.toString() !== this.props.tabs.toString()) {
            const newKeys = this.getDisplayScene(this.props.tabs, this.state.currentIndex)
            const obj = this.initializes(this.props)
            this.setState({ displayKeys: newKeys, tabs: this.props.tabs, ...obj })
        }
        if (prevProps.isRefreshing !== this.props.isRefreshing) {
            if (this.props.isRefreshing === false) {
                this.pullRefreshEnd()
            }
        }
    }

    /**
    * 计算scrollValue
    */
    handleScrollValue() {
        if (Platform.OS === 'ios') {
            this.scrollX.addListener(({ value }) => {
                this.state.scrollValue && this.state.scrollValue.setValue(value / this.state.sceneWidth)
            })
        } else {
            this.positionAndroid.addListener(({ value }) => { })
            this.offsetAndroid.addListener(({ value }) => {
                this.state.scrollValue && this.state.scrollValue.setValue(value + this.positionAndroid._value)
            })
        }
    }

    render() {
        const { contentStyle, style, scrollEnabled, isRefreshing, refreshHeight } = this.props
        const { childRefs } = this.state

        const enabled = scrollEnabled !== false
        const animatedStyle = pullRefreshAnimatedStyles(this.tabviewRefreshTrans, refreshHeight + overflowPull)
        const transform = isRefreshing ? undefined : animatedStyle.transform
        return (
            <PanGestureHandler
                ref={this.drawer}
                simultaneousHandlers={[...childRefs, this.contentScroll, this.headerRef, this.headerParentRef]}
                shouldCancelWhenOutside={false}
                onGestureEvent={this._onGestureEvent}
                failOffsetX={[-20, 20]}
                activeOffsetY={[-5, 5]}
                activeOffsetX={[-500, 500]}
                onHandlerStateChange={this._onHandlerStateChange}
                enabled={enabled}
            >
                <Animated.View style={[{ flex: 1, alignItems: 'center' }, style]} onLayout={this.containerOnLayout}>
                    <Animated.View style={{
                        flex: 1, width: '100%', transform
                    }}>
                        {this._renderFrozeView()}
                        <View style={[{ flex: 1, overflow: 'hidden', width: '100%' }, contentStyle]} onLayout={this.contentOnLayout}>
                            {this._renderTabBar()}
                            {this._renderHeader()}
                            {
                                this.state.tabviewHeight > 0 ?

                                    <NativeViewGestureHandler ref={this.contentScroll} >
                                        {this._renderContent()}
                                    </NativeViewGestureHandler>
                                    : null
                            }
                        </View>

                        {this._renderFooter()}
                        {this._renderScrollHead()}
                    </Animated.View>
                    {this.renderRefreshControl()}
                </Animated.View>
            </PanGestureHandler >
        )
    }

    _onHandlerStateChange = ({ nativeEvent }: PanGestureHandlerStateChangeEvent) => {
        if (nativeEvent.oldState === State.ACTIVE) {
            this.makePullRefreshRelease();

            this.emitListener(TABVIEW_PULL_RELESE)
        }

    };

    _renderFrozeView() {
        const { frozeTop } = this.props
        if (frozeTop === undefined) return null
        return <View style={{ height: frozeTop, backgroundColor: 'transparent' }} />
    }
    //渲染头部
    _renderHeader() {
        const { renderHeader, frozeTop, isRefreshing, refreshHeight } = this.props
        const headerHeight = this.getHeaderHeight() - frozeTop
        if (!renderHeader) return null
        const mStyle = getContentAnimatedStyles(this.state.containerTrans, headerHeight, isRefreshing, refreshHeight)
        return (
            <Animated.View style={mStyle}>
                {renderHeader(this.makeParams())}
            </Animated.View>
        )
    }
    //渲染尾部
    _renderFooter() {
        const { renderFooter } = this.props
        if (!renderFooter) return null
        return renderFooter(this.makeParams())
    }

    onPanResponderGrant = () => {
        this.emitListener(TABVIEW_HEADER_GRANT);
    }

    headerReleaseResponder = (e: PanGestureHandlerStateChangeEvent) => {
        this.emitListener(TABVIEW_HEADER_RELEASE, e);
    }

    stopHeaderAnimation = () => {
        this.headerTrans.stopAnimation(() => { })
    }

    getScrollEnabled() {
        return this.state.sceneScrollEnabled && this.props.scrollEnabled
    }

    //渲染可滑动头部
    _renderScrollHead() {

        const { renderScrollHeader, frozeTop, isRefreshing, refreshHeight } = this.props
        if (!renderScrollHeader) return null
        const { containerTrans, sceneScrollEnabled } = this.state;
        const headerHeight = this.getHeaderHeight() - frozeTop
        const mStyle = getScrollHeaderAnimatedStyles(containerTrans, headerHeight, isRefreshing, refreshHeight)
        return <ScrollHeader
            headerTrans={this.headerTrans}
            headerRef={this.headerRef}
            headerParentRef={this.headerParentRef}
            onPanResponderGrant={this.onPanResponderGrant}
            headerReleaseResponder={this.headerReleaseResponder}
            scrollEnabled={this.getScrollEnabled()}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                ...mStyle
            }} >
            {renderScrollHeader()}
        </ScrollHeader>

    }

    /**
    * 渲染tabbar
    */
    _renderTabBar() {
        const { renderTabBar } = this.props;
        const { tabs } = this.state;
        if (!tabs || !tabs.length) return null
        //组装参数
        const tabbarProps = this.makeTabParams()
        const { style, ...rest } = tabbarProps;
        const { transform, ...restStyle } = this.getStyle(style);
        const newProps = { ...rest, ...{ style: restStyle } }
        const tabbarContent = renderTabBar ? (renderTabBar(newProps) || null) : <Tabbar {...newProps} />
        //zIndex:10 ，In order for the Tabbar to be on top of the Tabview, to be able to respond to events
        return (
            <Animated.View onLayout={this.tabbarOnLayout} style={[tabbarProps.style, { zIndex: 10 }]}>
                {tabbarContent}
            </Animated.View>
        )
    }

    /**
    * 渲染内容
    */
    _renderContent() {
        if (Platform.OS === 'ios') {

            return <Animated.ScrollView
                ref={(scrollView: any) => { this.scrollView = scrollView; }}
                horizontal
                pagingEnabled
                automaticallyAdjustContentInsets={false}
                contentOffset={{ x: this.props.initialPage * this.state.sceneWidth, }}
                onMomentumScrollEnd={this.onMomentumScrollEnd}
                scrollEventThrottle={1}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: this.scrollX, }, }, },],
                    { useNativeDriver: true, listener: this.onScroll, }
                )}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={!this.props.locked}
                directionalLockEnabled
                alwaysBounceVertical={false}
                keyboardDismissMode="on-drag"
            >
                {this.getScene()}
            </Animated.ScrollView>
        } else {
            return <AnimatedViewPagerAndroid
                ref={(_ref: any) => this.androidPager = _ref}
                key={this.state.tabs.length}
                style={{ flex: 1 }
                }
                initialPage={this.props.initialPage}
                onPageSelected={this.sceneWillShow}
                keyboardDismissMode="on-drag"
                orientation={'horizontal'}
                scrollEnabled={!this.props.locked}
                onPageScroll={
                    Animated.event(
                        [{
                            nativeEvent: {
                                position: this.positionAndroid,
                                offset: this.offsetAndroid,
                            },
                        },],
                        {
                            useNativeDriver: true,
                            listener: this.onScroll,
                        },
                    )
                }
            >
                {this.getScene()}
            </AnimatedViewPagerAndroid >
        }
    }

    /**
    * 获取标签子页面
    */
    getScene() {
        const { renderScene, renderScrollHeader } = this.props;
        const { sceneWidth, displayKeys, currentIndex, tabs } = this.state;
        return tabs.map((item, index) => {
            const key = this.makeSceneKey(index)
            const display = this.sceneKeyIsDisplay(displayKeys, key)

            //如果有scrollHeader，标签页必须保持update状态
            const showUpdate = renderScrollHeader ? true : this.sceneShouldPreInit(currentIndex, index)
            return <Scene key={this.makeSceneKey(index)} style={{ width: sceneWidth }} shouldUpdate={showUpdate}>
                {(display && renderScene) ? renderScene(this.makeSceneParams(item, index)) : <View />}
            </Scene>

        })
    }
    /**
    * 跳转页面
    */
    goToPage = (index: number) => {
        this.emitListener(TABVIEW_TABDIDCLICK);
        if (Platform.OS === 'ios') {
            const offset = this.state.sceneWidth * index;
            this.getScrollNode() && this.getScrollNode().scrollTo({ x: offset, y: 0, animated: true })
        } else {
            this.getPagerNode() && this.getPagerNode().setPage(index);
        }
        this.sceneWillShow(index)
    }

    /**
    * 动画停止
    */
    onMomentumScrollEnd = (e: any) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const page = Math.round(offsetX / this.state.sceneWidth);
        if (this.state.currentIndex !== page) {
            this.pageHasChange(page);
        }
    }
    /**
    * 显示页面发生变化
    */
    pageHasChange(page: number) {
        this.sceneWillShow(page)
    }
    /**
    * 页面将要显示
    */
    sceneWillShow = (page: any) => {

        let zPage = page;
        if (typeof page === 'object') {
            zPage = page.nativeEvent.position
        }
        const { currentIndex } = this.state;

        this.updateDisplayScene(zPage, this.onChangeTab.bind(this, currentIndex, zPage))
    }

    /**
    * tabbar切换
    */
    onChangeTab(currentIndex: number, page: number) {
        if (currentIndex === page) return;
        if (this.props.onChangeTab) {
            this.props.onChangeTab({ from: currentIndex, curIndex: page })
        }
    }

    onScroll = (e: any) => {
        this.emitListener(TABVIEW_ONSCROLL)
        if (Platform.OS === 'ios') {
            const offsetX = e.nativeEvent.contentOffset.x;
            if (offsetX === 0 && !this.scrollOnMountCalled) {
                this.scrollOnMountCalled = true;
            } else {
                this.props.onScroll && this.props.onScroll(offsetX / this.state.sceneWidth);
            }
        } else {
            const { position, offset, } = e.nativeEvent;
            this.props.onScroll && this.props.onScroll(position + offset);
        }
    }
    /**
     * @description: 更新当前页面和当前应该显示的页面
     * @param {page} 目标页面
     * @param {callback} 回调
     */
    updateDisplayScene(page: number, callback = () => { }, tabs = this.state.tabs) {
        const { displayKeys } = this.state;
        const keys = this.getDisplayScene(tabs, page, displayKeys);
        this.setState({ currentIndex: page, displayKeys: keys }, callback)
    }
    /**
     * @description: 获取跳转到目标页面后，需要显示的页面
     * @param {Array} tabs
     * @param {number} page 当前页面
     * @return: 所有需要显示的页面
     */
    getDisplayScene(tabs = this.state.tabs, page = 0, displayKeys = {}) {
        const zPage = page
        const zKeys: DisplayKeys = Object.assign({}, displayKeys)
        tabs.forEach((element, index) => {

            if (this.sceneShouldPreInit(zPage, index)) {
                const sceneKey = this.makeSceneKey(index)
                if (!this.sceneKeyIsDisplay(zKeys, sceneKey)) {
                    zKeys[sceneKey] = true
                }
            }
        });

        return Object.assign({}, zKeys)
    }
    /**
     * @description: 
     * @param {number}} page 当前显示的page序号
     * @param {number} sceneIndex 需要比较的页面
     * @return: sceneIndex是否在page的预加载行列
     */
    sceneShouldPreInit(page: number, sceneIndex: number) {
        const { preInitSceneNum } = this.props
        return ((sceneIndex >= page - preInitSceneNum) || (page - preInitSceneNum <= 0)) && sceneIndex <= page + preInitSceneNum
    }
    /**
     * @description: 
     * @return: key是否显示
     */
    sceneKeyIsDisplay(allScenekeys: DisplayKeys, key: string) {
        if (allScenekeys.constructor === Object && allScenekeys.hasOwnProperty(key) && allScenekeys[key]) return true
        return false
    }

    makeSceneKey(index: number) {
        return 'SCENE_' + index
    }

    tabbarOnLayout = (event: LayoutChangeEvent) => {
        this.setState({ tabbarHeight: event.nativeEvent.layout.height })
    }
    /**
    * 整体的layout方法
    */
    containerOnLayout = (event: LayoutChangeEvent) => {
        this.setState({ tabviewHeight: event.nativeEvent.layout.height })
    }
    /**
    * tabview部分的layout方法
    */
    contentOnLayout = (event: LayoutChangeEvent) => {
        this.setState({ sceneWidth: event.nativeEvent.layout.width })
    }

    /**
     * 抛出内部子页面上下滑动的y动画对象
     */
    makeScrollTrans() {
        this.props.makeScrollTrans && this.props.makeScrollTrans(this.state.containerTrans)
    }
    /**
     * 标签页被拉拽
     * @param {number} index 标签页的序号
     */
    scenePageDidDrag = (index: number) => {
        this.stopHeaderAnimation()
        this.emitListener(TABVIEW_BECOME_RESPONDER, index)
    }

    emitListener(eventName: string, params?: any) {
        if (this.observers.hasOwnProperty(eventName)) {
            const allObservers = this.observers[eventName];

            allObservers.forEach(observer => {
                const { instance, callback } = observer;
                if (instance && callback && typeof callback === 'function') {
                    if (params !== undefined) {
                        callback(params)
                    } else {
                        callback()
                    }
                }
            });
        }
    }

    removeListener = (instance: any, eventName: string, callback: any) => {
        if (this.observers.hasOwnProperty(eventName)) {
            const allObservers = this.observers[eventName];
            const spliceIndex = allObservers.findIndex((el) => el.callback === callback)

            if (spliceIndex >= 0) {
                allObservers.splice(spliceIndex, 1)
            }

        }
    }

    addListener = (instance: any, eventName: string, callback: any) => {

        if (this.observers.hasOwnProperty(eventName)) {
            const allObservers = this.observers[eventName];
            if (allObservers.find((el) => el.callback === callback)) return;
            allObservers.push({ instance, callback })
        } else {
            this.observers[eventName] = [{ instance, callback }]
        }
    }

    getScrollNode() {
        if (this.scrollView && this.scrollView.scrollTo) {
            return this.scrollView
        }
        return this.scrollView && this.scrollView.getNode ? this.scrollView.getNode() : null
    }
    getPagerNode() {
        if (this.androidPager && this.androidPager.setPage) {
            return this.androidPager
        }
        return this.androidPager && this.androidPager.getNode ? this.androidPager.getNode() : null
    }

    initializes(props = this.props) {
        const childRefs: Array<React.RefObject<any>> = []
        const refreshTrans: Array<Animated.Value> = []
        const sceneTrans: Array<Animated.Value> = []
        props.tabs.forEach(tabItem => {
            childRefs.push(React.createRef());
            refreshTrans.push(new Animated.Value(0));
            sceneTrans.push(new Animated.Value(0));
        });
        return { childRefs, refreshTrans, sceneTrans }
    }

    getRefreshTrans(currentIndex = this.state.currentIndex) {
        if (this.state.refreshTrans.length <= currentIndex) return new Animated.Value(0);
        return this.state.refreshTrans[currentIndex]
    }
    getChildRef(currentIndex = this.state.currentIndex) {
        if (this.state.childRefs.length <= currentIndex) return new Animated.Value(0);
        return this.state.childRefs[currentIndex]
    }
    getSceneTrans(currentIndex = this.state.currentIndex) {
        if (this.state.sceneTrans.length <= currentIndex) return new Animated.Value(0);
        return this.state.sceneTrans[currentIndex]
    }

    /******************************************** Pull-refresh ********************************************/

    addViewListener() {
        if (this.props.onStartRefresh === undefined) return;

        this.dragYEvent = this.dragY.addListener(this.tabviewDidDrag);
        this.tabviewRefreshEvent = this.tabviewRefreshTrans.addListener(({ value }) => { });
        this.containerTransEvent = this.state.containerTrans.addListener(this.containerTransUpdate)

    }

    removeViewListener() {
        if (this.props.onStartRefresh === undefined) return;

        this.dragY.removeListener(this.dragYEvent);
        this.tabviewRefreshTrans.removeListener(this.tabviewRefreshEvent);
        this.state.containerTrans.removeListener(this.containerTransEvent);
    }
    //RefreshControl container
    renderContent = (refreshProps: any) => {
        const { renderRefreshControl } = this.props;

        if (renderRefreshControl) {
            return renderRefreshControl()
        }
        return <RefreshControlAnimated {...refreshProps} />

    }

    //render Refresh component
    renderRefreshControl() {
        const { isRefreshing, onStartRefresh, refreshHeight } = this.props;
        const { containerTrans } = this.state
        if (!onStartRefresh) return;

        const refreshProps = {
            headerHeight: 0,
            containerTrans,
            transY: this.tabviewRefreshTrans,
            isRefreshing,
            isActive: true,
            scrollYTrans: containerTrans,
            removeListener: this.removeListener,
            addListener: this.addListener,
            refreshHeight,
            overflowPull,
            hideContent: false,
            renderContent: this.renderContent
        }

        return (
            <PullRefreshView {...refreshProps} />
        )
    }

    containerTransUpdate = ({ value }: { value: number }) => {
        if (!this.props.onStartRefresh) return;
        if (value > 0) {
            this.shouldStartRefresh = false;
        } else {
            if (this.shouldStartRefresh === true) return
            this.shouldStartRefresh = true;
        }
    }

    tabviewDidDrag = (e: { value: number }) => {
        const { value } = e
        if (!this.props.onStartRefresh) return false;
        if (this.props.isRefreshing) return false
        if (value <= 0) return false;

        if (this.startRefresh) {
            this.tabviewRefreshTrans.setValue(value - this.startDragY)
        } else if (this.shouldStartRefresh) {
            this.setState({ sceneScrollEnabled: false }, () => {
                this.startDragY = value
                this.startRefresh = true
            })
        }

    }

    makePullRefreshRelease = () => {
        if (!this.props.onStartRefresh) return;
        if (this.props.isRefreshing) return;

        this.startDragY = 0;

        if (this.tabviewRefreshTrans._value > this.props.refreshHeight) {
            this.setState({ sceneScrollEnabled: true }, () => {
                this.pageOnScroll()
            })
        } else {
            this.pullRefreshEnd()
        }
    }

    pageOnScroll = () => {
        this.props.onStartRefresh && this.props.onStartRefresh();
    }

    pullRefreshEnd() {
        if (!this.props.onStartRefresh) return;
        this.setState({ sceneScrollEnabled: true }, () => {
            this.tabviewRefreshTrans.setValue(0)
            this.startRefresh = false;
        })

    }
    /******************************************** Pull-refresh ********************************************/

    /**
    * renderHeader和renderFooter的参数装配
    */
    makeParams() {
        const { tabs, currentIndex } = this.state;
        if (tabs && tabs.length > currentIndex) {
            return { item: tabs[currentIndex], index: currentIndex }
        }
        return null
    }

    /**
     * 组装子页面的参数
     */
    makeSceneParams(item: T, index: number) {
        const { makeHeaderHeight, faultHeight, renderScrollHeader, frozeTop, isRefreshing, onStartRefresh } = this.props;
        if (!renderScrollHeader) {
            return { item, index }
        }

        const { currentIndex, containerTrans, tabviewHeight, tabbarHeight, childRefs } = this.state;

        const params: PageViewHocProps<T> = {
            item,
            index,
            isActive: currentIndex == index,
            containerTrans,
            makeHeaderHeight,
            faultHeight,
            frozeTop,
            headerTrans: this.headerTrans,
            childRefs,
            addListener: this.addListener,
            removeListener: this.removeListener,
            scenePageDidDrag: this.scenePageDidDrag,
            dragY: this.dragY,
            refreshTrans: this.getRefreshTrans(index),
            expectHeight: this.getHeaderHeight() + tabviewHeight - tabbarHeight - frozeTop * 2,
            scrollYTrans: this.getSceneTrans(index),
            sceneScrollEnabled: this.getScrollEnabled(),
            isRefreshingTabView: isRefreshing,
            pulldownEnabled: onStartRefresh === undefined
        };

        return params;
    }

    /**
     * 组装给tabbar的参数
     */
    makeTabParams() {

        const { tabbarStyle, renderScrollHeader, frozeTop, tabs, tabNameConvert, averageTab, tabsContainerStyle, activeTextStyle, inactiveTextStyle, isRefreshing, refreshHeight } = this.props
        const params: TabbarInfo<T> = {
            tabs,
            tabNameConvert,
            averageTab,
            tabsContainerStyle,
            activeTextStyle,
            inactiveTextStyle,
            goToPage: this.goToPage,
            activeIndex: this.state.currentIndex,
            scrollValue: this.state.scrollValue,
            style: {}
        }

        if (tabbarStyle) {
            params.style = this.getStyle(tabbarStyle)
        }
        if (renderScrollHeader) {
            const headerHeight = this.getHeaderHeight() - frozeTop
            const mStyle = getContentAnimatedStyles(this.state.containerTrans, headerHeight, isRefreshing, refreshHeight)
            params.style = Object.assign(params.style, mStyle)
        }


        return params;
    }

    getHeaderHeight() {
        if (this.props.makeHeaderHeight) {
            return Math.floor(this.props.makeHeaderHeight())
        }
        return 0;
    }

    getStyle(style: any) {
        if (style === undefined) return {};
        if (style.constructor == Object) {
            return style;
        } else if (style.constructor == Array) {
            let finalStyle = {}
            style.forEach((element: any) => {
                const objEl = this.getStyle(element);
                finalStyle = Object.assign(finalStyle, objEl)
            });
            return finalStyle
        }
    }
}


class SceneView extends React.Component<SceneProps> {

    shouldComponentUpdate(nextProps: any) {
        return !!nextProps.shouldUpdate;
    }

    render() {
        return React.Children.only(this.props.children)
    }
}

const Scene = (props: SceneProps) => {

    return <View {...props}>
        <SceneView shouldUpdate={props.shouldUpdate}>
            {props.children}
        </SceneView>
    </View>
}