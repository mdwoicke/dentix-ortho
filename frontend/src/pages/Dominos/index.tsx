/**
 * Dominos Layout
 * Tab router wrapper for Domino's integration pages
 */

import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../utils/constants';

const tabs = [
  { name: 'Dashboard', path: ROUTES.DOMINOS_DASHBOARD },
  { name: 'Orders', path: ROUTES.DOMINOS_ORDERS },
  { name: 'Health', path: ROUTES.DOMINOS_HEALTH },
  { name: 'Menu', path: ROUTES.DOMINOS_MENU },
  { name: 'Sessions', path: ROUTES.DOMINOS_SESSIONS },
  { name: 'Errors', path: ROUTES.DOMINOS_ERRORS },
  { name: 'Call Tracing', path: ROUTES.DOMINOS_CALL_TRACING },
];

export function DominosLayout() {
  const location = useLocation();

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <nav className="flex space-x-8 px-6" aria-label="Dominos Tabs">
          {tabs.map((tab) => {
            const isActive = location.pathname.startsWith(tab.path);
            return (
              <NavLink
                key={tab.name}
                to={tab.path}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${isActive
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                {tab.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

export { default as DominosDashboard } from './DominosDashboard';
export { default as DominosOrders } from './DominosOrders';
export { default as DominosHealth } from './DominosHealth';
export { default as DominosMenu } from './DominosMenu';
export { default as DominosSessions } from './DominosSessions';
export { default as DominosErrors } from './DominosErrors';
export { default as DominosCallTracing } from './DominosCallTracing';
