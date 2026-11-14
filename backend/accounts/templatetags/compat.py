from django import template

register = template.Library()


@register.filter(name="length_is")
def length_is(value, expected_length):
    """
    Replacement for Django's removed length_is filter (removed in Django 5).
    Returns True if len(value) equals expected_length.
    """
    try:
        return len(value) == int(expected_length)
    except (TypeError, ValueError):
        return False
