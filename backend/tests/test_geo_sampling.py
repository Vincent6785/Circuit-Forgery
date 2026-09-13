from app.services.geo_sampling import subsample, subsample_indices


def test_subsample_returns_same_list_if_under_limit():
    items = [1, 2, 3]
    assert subsample(items, 5) == items


def test_subsample_caps_at_max_items():
    items = list(range(100))
    result = subsample(items, 10)
    assert len(result) <= 10


def test_subsample_preserves_first_and_last():
    items = list(range(50))
    result = subsample(items, 5)
    assert result[0] == 0
    assert result[-1] == 49


def test_subsample_preserves_order():
    items = list(range(50))
    result = subsample(items, 10)
    assert result == sorted(result)


def test_subsample_does_not_divide_by_zero_when_max_items_is_one():
    items = list(range(50))
    result = subsample(items, 1)
    assert result == [0]


def test_subsample_indices_under_limit_keeps_everything():
    assert subsample_indices(3, 5) == [0, 1, 2]


def test_subsample_indices_keeps_both_ends_and_order():
    indices = subsample_indices(500, 10)
    assert len(indices) <= 10
    assert indices[0] == 0
    assert indices[-1] == 499
    assert indices == sorted(set(indices))


def test_subsample_indices_degenerate_limits():
    assert subsample_indices(50, 1) == [0]
    assert subsample_indices(50, 0) == []
    assert subsample_indices(0, 10) == []


def test_subsample_matches_indices():
    items = list(range(100, 200))
    assert subsample(items, 7) == [items[i] for i in subsample_indices(len(items), 7)]
