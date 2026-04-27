import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Layout, Typography, Menu, Space, Button, Tooltip, Spin, Grid } from 'antd';
import {
  DashboardOutlined,
  MenuOutlined,
  SunOutlined,
  MoonOutlined,
  FundOutlined,
  RadarChartOutlined,
  FolderOutlined,
} from '@ant-design/icons';

import ErrorBoundary from './components/ErrorBoundary';
import { useTheme } from './contexts/ThemeContext';
import { APP_VERSION } from './generated/version';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { buildViewUrlForCurrentState, readViewAliasFromPathname } from './utils/researchContext';

// 懒加载非核心组件，减少初始包大小


const AlertCenter = lazyWithRetry(() => import('./components/AlertCenter'), { reloadKey: 'alert-center' });
const CrossMarketBacktestPanel = lazyWithRetry(() => import('./components/CrossMarketBacktestPanel'), { reloadKey: 'cross-market-panel' });
const PricingResearch = lazyWithRetry(() => import('./components/PricingResearch'), { reloadKey: 'pricing-research' });
const GodEyeDashboard = lazyWithRetry(() => import('./components/GodEyeDashboard'), { reloadKey: 'godeye-dashboard' });
const ResearchWorkbench = lazyWithRetry(() => import('./components/ResearchWorkbench'), { reloadKey: 'research-workbench' });
const QuantLab = lazyWithRetry(() => import('./components/QuantLab'), { reloadKey: 'quant-lab' });

// 懒加载占位组件
const LazyLoadFallback = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '300px'
  }}>
    <Spin size="large" />
    <div style={{ marginTop: 12, color: '#8c8c8c' }}>加载中...</div>
  </div>
);

const { Header, Content, Sider } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;
const VIEW_QUERY_KEY = 'view';
const TAB_QUERY_KEY = 'tab';
const VISIBLE_VIEWS = new Set(['pricing', 'godsEye', 'godeye', 'workbench', 'quantlab']);
const INTERNAL_CROSS_MARKET_VIEW = 'backtest';
const WIDE_VIEW_SET = new Set(['pricing', 'godsEye', 'godeye', 'workbench', 'quantlab', INTERNAL_CROSS_MARKET_VIEW]);
const FULL_VIEW_SET = new Set();
const readViewStateFromLocation = (
  search = window.location.search,
  pathname = window.location.pathname,
) => {
  const params = new URLSearchParams(search);
  const requestedView = params.get(VIEW_QUERY_KEY);
  const requestedTab = params.get(TAB_QUERY_KEY);

  if ((requestedView === INTERNAL_CROSS_MARKET_VIEW || !requestedView) && requestedTab === 'cross-market') {
    return {
      currentView: INTERNAL_CROSS_MARKET_VIEW,
      realtimeAuxIntent: null,
    };
  }

  if (requestedView && VISIBLE_VIEWS.has(requestedView)) {
    return {
      currentView: requestedView === 'godeye' ? 'godsEye' : requestedView,
      realtimeAuxIntent: null,
    };
  }

  const pathnameView = readViewAliasFromPathname(pathname);
  if (pathnameView && (VISIBLE_VIEWS.has(pathnameView) || pathnameView === INTERNAL_CROSS_MARKET_VIEW)) {
    return {
      currentView: pathnameView,
      realtimeAuxIntent: null,
    };
  }

  return {
    currentView: 'pricing',
    realtimeAuxIntent: null,
  };
};

function App() {
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  // Theme
  const { isDarkMode, toggleTheme } = useTheme();
  const [viewState, setViewState] = useState(() => readViewStateFromLocation());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { currentView } = viewState;
  const primaryNavigationId = 'app-primary-navigation';
  const mobileMenuLabel = mobileMenuOpen ? '收起导航菜单' : '展开导航菜单';
  const themeToggleLabel = isDarkMode ? '切换到浅色主题' : '切换到深色主题';
  const viewFrameClassName = FULL_VIEW_SET.has(currentView)
    ? 'app-view-frame app-view-frame--full'
    : WIDE_VIEW_SET.has(currentView)
      ? 'app-view-frame app-view-frame--wide'
      : 'app-view-frame app-view-frame--focused';

  useEffect(() => {
    const applyViewFromUrl = () => {
      setViewState(readViewStateFromLocation(window.location.search, window.location.pathname));
    };

    applyViewFromUrl();
    window.addEventListener('popstate', applyViewFromUrl);
    return () => window.removeEventListener('popstate', applyViewFromUrl);
  }, []);

  useEffect(() => {
    const nextUrl = buildViewUrlForCurrentState(currentView, window.location.search, window.location.pathname);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [currentView]);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  const menuItems = [
    {
      key: 'pricing',
      icon: <FundOutlined />,
      label: '定价研究',
    },
    {
      key: 'godsEye',
      icon: <RadarChartOutlined />,
      label: '上帝视角',
    },
    {
      key: 'workbench',
      icon: <FolderOutlined />,
      label: '研究工作台',
    },
    {
      key: 'quantlab',
      icon: <DashboardOutlined />,
      label: '量化实验台',
    }
  ];

  const setCurrentView = useCallback((nextView) => {
    setViewState((prev) => ({
      ...prev,
      currentView: nextView,
      realtimeAuxIntent: null,
    }));
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  const renderContent = () => {
    switch (currentView) {
      case 'pricing':
        return <Suspense fallback={<LazyLoadFallback />}><PricingResearch /></Suspense>;
      case 'godsEye':
      case 'godeye':
        return <Suspense fallback={<LazyLoadFallback />}><GodEyeDashboard /></Suspense>;
      case 'workbench':
        return <Suspense fallback={<LazyLoadFallback />}><ResearchWorkbench /></Suspense>;
      case 'quantlab':
        return <Suspense fallback={<LazyLoadFallback />}><QuantLab /></Suspense>;
      case 'backtest':
        return <Suspense fallback={<LazyLoadFallback />}><CrossMarketBacktestPanel /></Suspense>;
      default:
        return <Suspense fallback={<LazyLoadFallback />}><PricingResearch /></Suspense>;
    }
  };

  return (
    <ErrorBoundary>
      <Layout className="app-root-layout">
        <Header className="app-main-header">
          <div className="app-brand">
            {isMobile ? (
              <Button
                className="app-main-header__menu-trigger"
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label={mobileMenuLabel}
                aria-controls={primaryNavigationId}
                aria-expanded={mobileMenuOpen}
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                }}
              />
            ) : null}
            <DashboardOutlined className="app-brand__mark" style={{
              fontSize: '22px',
              color: 'var(--accent-primary)'
            }} />
            <div className="app-brand__identity">
              <Title className="app-brand__title" level={4} style={{
                margin: 0,
                fontWeight: 700,
                letterSpacing: '0.5px',
                color: 'var(--text-primary)',
                fontSize: '18px',
                lineHeight: '1'
              }}>
                超级定价系统
              </Title>
              <span className="app-brand__version" style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary)',
                fontWeight: 500,
                lineHeight: '1.4'
              }}>{`v${APP_VERSION}`}</span>
            </div>
          </div>
          <Space className="app-main-header__actions" size={isMobile ? 8 : 16}>
            <Tooltip title={themeToggleLabel}>
              <Button
                className="app-main-header__theme-toggle"
                type="text"
                icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                aria-label={themeToggleLabel}
                aria-pressed={isDarkMode}
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '16px'
                }}
              />
            </Tooltip>
            <Suspense fallback={null}>
              <AlertCenter />
            </Suspense>
          </Space>
        </Header>
        <Layout className="app-main-shell">
          <Sider
            id={primaryNavigationId}
            aria-label="主导航"
            className="app-main-sider"
            width={220}
            collapsible
            trigger={null}
            collapsed={isMobile ? !mobileMenuOpen : false}
            collapsedWidth={isMobile ? 0 : 64}
          >
            <Menu
              className="app-main-menu"
              mode="inline"
              selectedKeys={[currentView]}
              items={menuItems}
              onClick={({ key }) => {
                setCurrentView(key);
              }}
            />
          </Sider>
          <Layout className="app-main-body">
            <Content className="app-main-content">
              <div className={viewFrameClassName}>
                {renderContent()}
              </div>
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
