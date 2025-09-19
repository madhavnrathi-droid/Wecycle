# Wecycle Development Guidelines

## 🎯 Project Overview

Wecycle is a production-ready circular economy platform built with modern web technologies. These guidelines ensure consistency, maintainability, and scalability across the codebase.

## 📋 Code Standards

### TypeScript
- **Strict Mode**: All TypeScript strict checks enabled
- **Type Safety**: Avoid `any` types - use proper TypeScript types
- **Interface Design**: Prefer interfaces over type aliases for object shapes
- **Generics**: Use generics for reusable components and functions

```typescript
// ✅ Good
interface User {
  id: string
  name: string
  email: string
}

// ❌ Bad
const user: any = { id: 1, name: "John" }
```

### Component Architecture
- **Functional Components**: Use functional components with hooks
- **Component Composition**: Prefer composition over inheritance
- **Single Responsibility**: One component, one purpose
- **Props Interface**: Always define props interfaces

```tsx
// ✅ Good
interface ButtonProps {
  variant: 'primary' | 'secondary'
  children: React.ReactNode
  onClick?: () => void
}

export function Button({ variant, children, onClick }: ButtonProps) {
  return (
    <button className={getButtonStyles(variant)} onClick={onClick}>
      {children}
    </button>
  )
}
```

### State Management
- **Local State**: Use `useState` for component-local state
- **Shared State**: Use React Context for app-wide state
- **Server State**: Use Supabase real-time subscriptions
- **Derived State**: Compute from existing state, don't store separately

### Error Handling
- **Error Boundaries**: Wrap components with error boundaries
- **Loading States**: Always show loading states for async operations
- **User Feedback**: Provide clear error messages to users
- **Graceful Degradation**: App should work even with partial failures

```tsx
// ✅ Good
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

const handleSubmit = async () => {
  try {
    setLoading(true)
    setError(null)
    await submitData()
  } catch (err) {
    setError('Failed to submit. Please try again.')
  } finally {
    setLoading(false)
  }
}
```

## 🎨 Design System

### Color Palette
- **Primary**: Green tones (#22c55e) for sustainability theme
- **Secondary**: Blue tones (#3b82f6) for secondary actions
- **Neutral**: Gray scale for backgrounds and text
- **Status**: Red for errors, yellow for warnings, green for success

### Typography
- **Headings**: Use h1-h4 with appropriate font weights
- **Body Text**: Consistent line height and font sizes
- **Labels**: Clear, descriptive labels for form fields
- **No Custom Font Sizes**: Use default typography unless specifically needed

### Spacing & Layout
- **Consistent Spacing**: Use Tailwind spacing scale (4px grid)
- **Responsive Design**: Mobile-first approach
- **Flexbox/Grid**: Use modern layout techniques
- **Whitespace**: Adequate whitespace for readability

```tsx
// ✅ Good - Consistent spacing
<div className="p-4 space-y-6">
  <h2 className="mb-4">Title</h2>
  <div className="grid gap-4 md:grid-cols-2">
    {/* Content */}
  </div>
</div>
```

## 🔧 Technical Guidelines

### Performance
- **Lazy Loading**: Load components on demand
- **Image Optimization**: Use appropriate image formats and sizes
- **Bundle Size**: Monitor and optimize bundle size
- **Caching**: Implement appropriate caching strategies

```tsx
// ✅ Good - Lazy loading
const LazyProfile = lazy(() => import('./components/Profile'))

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyProfile />
    </Suspense>
  )
}
```

### Security
- **Input Validation**: Validate all user inputs
- **XSS Prevention**: Sanitize user-generated content
- **Authentication**: Proper auth state management
- **Environment Variables**: Never expose secrets in client code

### Database Interactions
- **Supabase Client**: Use the configured Supabase client
- **Error Handling**: Handle database errors gracefully
- **Real-time**: Use subscriptions for live data
- **Offline Support**: Handle offline scenarios

```typescript
// ✅ Good - Proper error handling
const { data, error } = await supabase
  .from('uploads')
  .select('*')
  .eq('status', 'active')

if (error) {
  console.error('Database error:', error)
  throw new Error('Failed to load materials')
}
```

## 🧪 Testing Standards

### Unit Testing
- **Test Coverage**: Aim for >80% coverage
- **Test Behavior**: Test component behavior, not implementation
- **Mock External**: Mock external dependencies (Supabase, APIs)
- **Accessible Tests**: Use testing-library best practices

```typescript
// ✅ Good - Testing behavior
test('should show error message when upload fails', async () => {
  render(<UploadForm />)
  
  fireEvent.click(screen.getByText('Upload'))
  
  await waitFor(() => {
    expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
  })
})
```

### Integration Testing
- **User Flows**: Test complete user journeys
- **API Integration**: Test with real API calls in staging
- **Cross-browser**: Test on major browsers
- **Mobile Testing**: Test responsive design

## 🚀 Deployment Guidelines

### Environment Management
- **Staging Environment**: Always test in staging first
- **Environment Variables**: Use proper env var management
- **Feature Flags**: Use flags for gradual rollouts
- **Monitoring**: Set up error monitoring and analytics

### Performance Monitoring
- **Core Web Vitals**: Monitor LCP, FID, CLS
- **Bundle Analysis**: Regular bundle size analysis
- **Error Tracking**: Monitor and fix production errors
- **User Analytics**: Track user behavior and conversion

## 📝 Documentation Standards

### Code Documentation
- **JSDoc Comments**: Document complex functions
- **README Files**: Keep README files up-to-date
- **API Documentation**: Document API interfaces
- **Component Stories**: Use Storybook for component docs

```typescript
/**
 * Uploads a material with image handling and validation
 * @param materialData - The material data to upload
 * @param images - Array of image files
 * @returns Promise resolving to the created material
 */
async function uploadMaterial(
  materialData: MaterialData,
  images: File[]
): Promise<Material> {
  // Implementation
}
```

### User Documentation
- **Setup Guide**: Clear setup instructions
- **Feature Documentation**: How-to guides for features
- **Troubleshooting**: Common issues and solutions
- **API Reference**: Complete API documentation

## 🌍 Accessibility Guidelines

### WCAG Compliance
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Readers**: Proper ARIA labels and roles
- **Color Contrast**: Meet WCAG AA standards
- **Focus Management**: Visible focus indicators

```tsx
// ✅ Good - Accessible form
<label htmlFor="material-title" className="sr-only">
  Material Title
</label>
<input
  id="material-title"
  type="text"
  placeholder="What material are you sharing?"
  aria-describedby="title-help"
  required
/>
<div id="title-help" className="text-sm text-gray-500">
  Be descriptive to help others find your material
</div>
```

### Semantic HTML
- **Proper Elements**: Use semantic HTML elements
- **Heading Structure**: Logical heading hierarchy
- **Form Labels**: Associate labels with form controls
- **Link Purpose**: Clear link text and purposes

## 🔄 Version Control

### Git Workflow
- **Branch Strategy**: Feature branches from main
- **Commit Messages**: Clear, descriptive commit messages
- **Pull Requests**: Code review for all changes
- **Semantic Versioning**: Follow semver for releases

```bash
# Good commit message format
feat: add real-time notifications for saved items
fix: resolve image upload validation error
docs: update deployment guide with Vercel instructions
```

### Code Review Process
- **Review Checklist**: Use consistent review criteria
- **Security Review**: Check for security issues
- **Performance Impact**: Consider performance implications
- **Accessibility Review**: Ensure accessibility standards

## 🎯 Production Readiness Checklist

### Pre-deployment
- [ ] All tests passing
- [ ] TypeScript errors resolved
- [ ] Performance optimized
- [ ] Security reviewed
- [ ] Accessibility tested
- [ ] Browser compatibility verified
- [ ] Mobile responsiveness confirmed
- [ ] Error handling comprehensive
- [ ] Loading states implemented
- [ ] Documentation updated

### Post-deployment
- [ ] Monitoring set up
- [ ] Error tracking active
- [ ] Performance metrics baseline
- [ ] User feedback collection
- [ ] Analytics tracking
- [ ] Backup procedures tested
- [ ] Rollback plan ready
- [ ] Team training completed

---

## 🚀 Success Metrics

### Technical Metrics
- **Page Load Time**: < 3 seconds
- **Core Web Vitals**: Green scores
- **Error Rate**: < 1%
- **Uptime**: > 99.9%
- **Test Coverage**: > 80%

### User Experience Metrics
- **User Retention**: Track returning users
- **Feature Adoption**: Monitor feature usage
- **Conversion Rate**: Successful material sharing
- **User Satisfaction**: Regular feedback collection

**Remember**: These guidelines are living documents. Update them as the project evolves and new best practices emerge.