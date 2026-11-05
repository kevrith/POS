import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { Button, IconButton, Badge, Input, Select, Tabs, Segmented, SideNav, Switch, ActionCard, AnimatedValue, ErrorState, describeLoadError, StatTile, EmptyState, PageHeader, Card, cn } from '..';

describe('cn', () => {
  it('joins truthy class names and skips the rest', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});

describe('Button', () => {
  it('is a plain button by default, so it never submits a form by accident', () => {
    expect(render(<Button>Save</Button>)).toContain('type="button"');
  });
  it('primary is the brand colour, danger is red', () => {
    expect(render(<Button>Save</Button>)).toContain('bg-brand-600');
    expect(render(<Button variant="danger">Delete</Button>)).toContain('bg-red-600');
  });
  it('is disabled and marked busy while loading, and shows a spinner instead of its icon', () => {
    const html = render(<Button loading icon={<i data-testid="icon" />}>Save</Button>);
    expect(html).toContain('disabled');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-spin');
    expect(html).not.toContain('data-testid="icon"');
  });
  it('md and lg meet a 40px and 48px height; sm is for dense tables', () => {
    expect(render(<Button size="md">x</Button>)).toContain('h-10');
    expect(render(<Button size="lg">x</Button>)).toContain('h-12');
    expect(render(<Button size="sm">x</Button>)).toContain('h-8');
  });
});

describe('IconButton', () => {
  it('always has an accessible name', () => {
    const html = render(<IconButton label="Refresh"><span /></IconButton>);
    expect(html).toContain('aria-label="Refresh"');
    expect(html).toContain('title="Refresh"');
  });
});

describe('Badge', () => {
  it('uses status colours for status tones', () => {
    expect(render(<Badge tone="success">Paid</Badge>)).toContain('text-green-800');
    expect(render(<Badge tone="danger">Overdue</Badge>)).toContain('text-red-800');
    expect(render(<Badge tone="warning">Low</Badge>)).toContain('text-amber-800');
  });
});

describe('Input and Select', () => {
  it('ties the label to the control, so the label is real text and not a placeholder', () => {
    const html = render(<Input label="Pump number" placeholder="e.g. 1" />);
    const id = /for="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('>Pump number</label>');
  });
  it('announces an error and marks the control invalid', () => {
    const html = render(<Input label="Email" error="Enter a valid email" />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Enter a valid email');
  });
  it('can hide the label visually but keep it for screen readers', () => {
    expect(render(<Input label="Search" hideLabel />)).toContain('sr-only');
  });
  it('a select has the same height and focus ring as an input, and a chevron', () => {
    const html = render(<Select label="Grade"><option>Super</option></Select>);
    expect(html).toContain('h-10');
    expect(html).toContain('focus:ring-brand-600/40');
    expect(html).toContain('<svg');
  });
});

describe('Tabs', () => {
  const tabs = [{ id: 'a', label: 'Pumps' }, { id: 'b', label: 'Tanks', count: 3 }] as const;
  it('marks the active tab for assistive tech and scrolls instead of clipping', () => {
    const html = render(<Tabs tabs={[...tabs]} value="b" onChange={() => {}} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('overflow-x-auto');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('>3<');
  });
});

describe('Segmented', () => {
  it('marks exactly one option active and wraps instead of clipping', () => {
    const html = render(<Segmented items={[{ id: 'a', label: 'Today' }, { id: 'b', label: 'Week' }]} value="a" onChange={() => {}} />);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('flex-wrap');
    expect(html).toContain('bg-brand-600');
  });
});

describe('SideNav', () => {
  const groups = [{ label: 'Business', items: [{ id: 'a', label: 'General' }, { id: 'b', label: 'Users' }] }, { label: 'Data', items: [{ id: 'c', label: 'Backup' }] }];
  it('lists every group and marks the current page', () => {
    const html = render(<SideNav groups={groups} value="b" onChange={() => {}} />);
    expect(html).toContain('Business');
    expect(html).toContain('Data');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

describe('Switch', () => {
  it('is a switch with a name and its state', () => {
    const on = render(<Switch checked label="Service charge" onChange={() => {}} />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="Service charge"');
    expect(render(<Switch checked={false} label="x" onChange={() => {}} />)).toContain('aria-checked="false"');
  });
});

describe('interactive cards', () => {
  it('a Card with onClick and interactive is a focusable button-like surface', () => {
    const html = render(<Card interactive onClick={() => {}}>x</Card>);
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('surface-interactive');
  });
  it('a plain Card stays still: no role, no lift', () => {
    const html = render(<Card>x</Card>);
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('surface-interactive');
    expect(html).toContain('surface');
  });
  it('ActionCard is a real button with its title, an icon tile and an arrow', () => {
    const html = render(<ActionCard icon={<i />} title="Find Customer" description="Search" onClick={() => {}} />);
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('Find Customer');
    expect(html).toContain('surface-icon');
    expect(html).toContain('surface-arrow');
  });
  it('a locked ActionCard cannot be pressed', () => {
    expect(render(<ActionCard icon={<i />} title="Inventory" onClick={() => {}} locked />)).toContain('disabled');
  });
  it('the stack layout has no arrow, and the danger tone has its own colour', () => {
    const html = render(<ActionCard icon={<i />} title="Credit" onClick={() => {}} layout="stack" tone="danger" />);
    expect(html).not.toContain('surface-arrow');
    expect(html).toContain('bg-red-100');
  });
});

describe('AnimatedValue', () => {
  it('renders the final formatted value where there is nothing to animate (server render, tests)', () => {
    expect(render(<AnimatedValue value={150000} format={(n) => `KES ${(n / 100).toFixed(2)}`} />)).toContain('KES 1500.00');
  });
});

describe('a failed load is not an empty list', () => {
  const apiError = (status: number, message = '') => Object.assign(new Error(message), { status });
  it('a 500 says the server could not load it and points at the migrations and the API terminal', () => {
    const d = describeLoadError(apiError(500, 'Internal server error'));
    expect(d.title).toBe('The server could not load this');
    expect(d.hint).toMatch(/migrations/i);
    expect(d.hint).toMatch(/API terminal/);
  });
  it('shows the API\'s own words when it says the database is out of date', () => {
    expect(describeLoadError(apiError(500, 'The database is out of date: a column is missing. Apply the pending database migrations.')).hint).toContain('database is out of date');
  });
  it('tells a refused request (403) from an unreachable server (no status)', () => {
    expect(describeLoadError(apiError(403, 'Upgrade your plan')).title).toBe('This is not available to you');
    expect(describeLoadError(new TypeError('Failed to fetch')).title).toBe('Cannot reach the server');
  });
  it('renders as an alert with a retry button, and reassures that nothing was lost', () => {
    const html = render(<ErrorState error={apiError(500)} subject="items" onRetry={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('The server could not load this: items');
    expect(html).toContain('Try again');
    expect(html).toContain('has not been changed or lost');
  });
});

describe('layout pieces', () => {
  it('StatTile keeps the figure in the normal text colour unless told it is good or bad', () => {
    expect(render(<StatTile label="Revenue" value="KES 0" />)).toContain('text-gray-900');
    expect(render(<StatTile label="Profit" value="-KES 5" tone="danger" />)).toContain('text-red-600');
  });
  it('EmptyState shows its title, description and action', () => {
    const html = render(<EmptyState title="No pumps" description="Add a grade first" action={<button>Add</button>} />);
    expect(html).toContain('No pumps');
    expect(html).toContain('Add a grade first');
    expect(html).toContain('<button>Add</button>');
  });
  it('PageHeader renders one h1 with actions', () => {
    const html = render(<PageHeader title="Inventory" subtitle="Items" actions={<button>New</button>} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<button>New</button>');
  });
  it('Card is the shared surface (white card on the page)', () => {
    expect(render(<Card>x</Card>)).toContain('class="surface"');
  });
});
