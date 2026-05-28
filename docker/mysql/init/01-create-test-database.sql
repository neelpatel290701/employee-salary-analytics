-- Create the dedicated test database used by the backend integration suite.
-- The development database (employee_analytics) is created by the MYSQL_DATABASE
-- environment variable; this init script only needs to add the test database
-- and grant the application user access to it.
--
-- See docs/06-tdd-strategy.md §5.5 for why integration tests use a separate
-- database rather than truncating the development one.

CREATE DATABASE IF NOT EXISTS employee_analytics_test;
GRANT ALL PRIVILEGES ON employee_analytics_test.* TO 'app'@'%';
FLUSH PRIVILEGES;
